
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from mcp.client.sse import sse_client
try:
    from mcp.client.streamable_http import streamablehttp_client
except ImportError:
    streamablehttp_client = None
from mcp import ClientSession
import json
import asyncio
import requests
import httpx

# Monkey-patch httpx to bypass SSL verification globally for self-signed certificates
try:
    original_async_init = httpx.AsyncClient.__init__
    def patched_async_init(self, *args, **kwargs):
        kwargs['verify'] = False
        original_async_init(self, *args, **kwargs)
    httpx.AsyncClient.__init__ = patched_async_init
    
    original_sync_init = httpx.Client.__init__
    def patched_sync_init(self, *args, **kwargs):
        kwargs['verify'] = False
        original_sync_init(self, *args, **kwargs)
    httpx.Client.__init__ = patched_sync_init
except Exception as patch_e:
    print(f"[Caregence] Failed to patch httpx SSL verification: {patch_e}")

app = Flask(__name__)
CORS(app)

# Global tools list that can be updated dynamically from the MCP server
DYNAMIC_TOOLS = []
CURRENT_SSE_URL = "http://localhost:9090/sse"
CAREGENCE_CONNECTIONS = []
CACHED_TOKEN = None

def get_caregence_token(force_refresh=False):
    global CACHED_TOKEN
    if CACHED_TOKEN and not force_refresh:
        return CACHED_TOKEN

    login_url = "https://dev-api.caregence.ai/users/login"
    login_payload = {
        "email": "administrator@caregence.ai",
        "password": "c9*mrwC!78"
    }
    print(f"[Caregence] Logging in with email: {login_payload['email']} ...")
    login_res = requests.post(login_url, json=login_payload)
    login_res.raise_for_status()
    
    login_data = login_res.json()
    access_token = login_data.get("access_token")
    if not access_token:
        if "data" in login_data and "access_token" in login_data["data"]:
            access_token = login_data["data"]["access_token"]
        
    if not access_token:
        raise Exception("No access token returned in login response.")
    
    CACHED_TOKEN = access_token
    return access_token

def fetch_caregence_connections():
    global CAREGENCE_CONNECTIONS
    try:
        access_token = get_caregence_token()

        conns_url = "https://dev-api.caregence.ai/connections/"
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        print("[Caregence] Fetching connections...")
        conns_res = requests.get(conns_url, headers=headers)
        
        # If token expired or is invalid (400, 401, 422), refresh token and retry once
        if conns_res.status_code in [400, 401, 422]:
            print(f"[Caregence] Fetching connections failed with {conns_res.status_code}. Retrying with fresh login...")
            access_token = get_caregence_token(force_refresh=True)
            headers["Authorization"] = f"Bearer {access_token}"
            conns_res = requests.get(conns_url, headers=headers)

        conns_res.raise_for_status()
        
        conns_data = conns_res.json()
        if conns_data.get("success"):
            CAREGENCE_CONNECTIONS = conns_data.get("data", [])
            print(f"[Caregence] Successfully fetched {len(CAREGENCE_CONNECTIONS)} connections.")
        else:
            print(f"[Caregence Error] Failed to fetch connections: {conns_data}")
            
    except Exception as e:
        print(f"[Caregence Error] Failed to fetch connections: {e}")


@app.route('/api/connection-actions/execute', methods=['POST'])
def proxy_connection_actions():
    try:
        print(f"[Caregence Action] Incoming request for action: {request.json.get('action')}")
        print(f"[Caregence Action] Payload: {json.dumps(request.json, indent=2)}")
        
        access_token = get_caregence_token()
        
        url = "https://dev-api.caregence.ai/connection-actions/execute"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        print(f"[Caregence Action] Sending POST to {url} ...")
        res = requests.post(url, headers=headers, json=request.json)
        
        # If token expired or is invalid (400, 401, 422), refresh token and retry once
        if res.status_code in [400, 401, 422]:
            print(f"[Caregence Action] Request failed with {res.status_code}. Retrying with fresh login...")
            access_token = get_caregence_token(force_refresh=True)
            headers["Authorization"] = f"Bearer {access_token}"
            res = requests.post(url, headers=headers, json=request.json)

        print(f"[Caregence Action] Response Status: {res.status_code}")
        try:
            res_json = res.json()
            print(f"[Caregence Action] Response JSON: {json.dumps(res_json, indent=2)}")
        except Exception:
            res_json = None
            print(f"[Caregence Action] Raw Response Text: {res.text}")
            
        res.raise_for_status()
        return jsonify(res_json if res_json else res.text)
    except Exception as e:
        print(f"[Caregence Action Error] {e}")
        return jsonify({"error": str(e)}), 500



async def fetch_tools_via_mcp(sse_url: str):
    """Use the official MCP Python client to connect and list tools, trying candidate URL paths, protocols, and bypassing SSL verification."""
    global CURRENT_SSE_URL
    initial_urls = [sse_url]
    if sse_url.startswith('https://'):
        alt_scheme = 'http://' + sse_url[8:]
        if alt_scheme not in initial_urls:
            initial_urls.append(alt_scheme)
    elif sse_url.startswith('http://'):
        alt_scheme = 'https://' + sse_url[7:]
        if alt_scheme not in initial_urls:
            initial_urls.append(alt_scheme)

    candidates = []
    for u in initial_urls:
        if u not in candidates:
            candidates.append(u)
        base_url = u.rstrip('/')
        if base_url.endswith('/sse'):
            candidates.append(base_url[:-4] + '/mcp')
            candidates.append(base_url[:-4] + '/mcp/sse')
        elif base_url.endswith('/mcp'):
            candidates.append(base_url + '/sse')
            candidates.append(base_url[:-4] + '/sse')
        else:
            candidates.append(f"{base_url}/mcp")
            candidates.append(f"{base_url}/sse")
            candidates.append(f"{base_url}/mcp/sse")

    # Clean duplicates while preserving order
    unique_candidates = []
    for c in candidates:
        if c not in unique_candidates:
            unique_candidates.append(c)
    candidates = unique_candidates

    last_error = None
    for url in candidates:
        print(f"[MCP] Connecting to candidate URL: {url}")
        
        # 1. Try standard sse_client first
        try:
            print(f"[MCP] Trying sse_client for {url} ...")
            async with sse_client(url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    print(f"[MCP] sse_client session initialized successfully with: {url}")
                    result = await session.list_tools()
                    tools = result.tools
                    print(f"[MCP] Found {len(tools)} tools via sse_client")
                    
                    tools_list = []
                    for t in tools:
                        tool_dict = {
                            "name": t.name,
                            "description": t.description or "",
                            "input_schema": t.inputSchema if isinstance(t.inputSchema, dict) else (t.inputSchema.model_dump() if hasattr(t.inputSchema, 'model_dump') else {}),
                            "meta": t.meta
                        }
                        tools_list.append(tool_dict)
                    
                    CURRENT_SSE_URL = url
                    # with open("tools1.json","w") as file:
                    #     json.dump(tools_list, file, indent=2)
                    return tools_list
        except Exception as e:
            print(f"[MCP] sse_client failed for {url}: {e}")
            if hasattr(e, 'exceptions'):
                for idx, sub_e in enumerate(e.exceptions):
                    print(f"  [MCP] sse_client sub-exception {idx}: {sub_e}")
            last_error = e

        # 2. Try streamablehttp_client if sse_client fails
        if streamablehttp_client is not None:
            try:
                print(f"[MCP] Trying streamablehttp_client for {url} ...")
                async with streamablehttp_client(url) as (read, write, _):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        print(f"[MCP] streamablehttp_client session initialized successfully with: {url}")
                        result = await session.list_tools()
                        tools = result.tools
                        print(f"[MCP] Found {len(tools)} tools via streamablehttp_client")
                        
                        tools_list = []
                        for t in tools:
                            tool_dict = {
                                "name": t.name,
                                "description": t.description or "",
                                "input_schema": t.inputSchema if isinstance(t.inputSchema, dict) else (t.inputSchema.model_dump() if hasattr(t.inputSchema, 'model_dump') else {}),
                                "meta": t.meta
                            }
                            tools_list.append(tool_dict)
                        
                        CURRENT_SSE_URL = url
                        # with open("tools1.json","w") as file:
                        #     json.dump(tools_list, file, indent=2)
                        return tools_list
            except Exception as e:
                print(f"[MCP] streamablehttp_client failed for {url}: {e}")
                if hasattr(e, 'exceptions'):
                    for idx, sub_e in enumerate(e.exceptions):
                        print(f"  [MCP] streamablehttp_client sub-exception {idx}: {sub_e}")
                last_error = e

    if last_error:
        raise last_error
    raise Exception("Failed to connect to any candidate URL")


@app.route('/fetch-tools', methods=['POST'])
def fetch_tools_from_sse():
    global DYNAMIC_TOOLS, CURRENT_SSE_URL
    sse_url = request.json.get('url', CURRENT_SSE_URL)
    if not sse_url:
        return jsonify({"error": "URL is required"}), 400

    try:
        # Run the async MCP client in a synchronous Flask context
        tools_list = asyncio.run(fetch_tools_via_mcp(sse_url))
        DYNAMIC_TOOLS = tools_list
        return jsonify({"status": "success", "tools": tools_list, "count": len(tools_list)})
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[MCP Error] {tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500


@app.route('/api/tools')
def api_tools():
    """API endpoint to get all available tools as JSON."""
    return jsonify({"tools": DYNAMIC_TOOLS, "count": len(DYNAMIC_TOOLS)})


@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    global CURRENT_SSE_URL
    if request.method == 'POST':
        CURRENT_SSE_URL = request.json.get('sse_url', CURRENT_SSE_URL)
        return jsonify({"status": "ok", "sse_url": CURRENT_SSE_URL})
    return jsonify({"sse_url": CURRENT_SSE_URL})


def resolve_schema(tool):
    """Resolve $ref in the tool schema."""
    schema = tool.get("input_schema", {})
    if not schema:
        return {}
    defs = schema.get("$defs", {})
    properties = schema.get("properties", {})

    resolved_props = {}
    for prop_name, prop_val in properties.items():
        if "$ref" in prop_val:
            ref_key = prop_val["$ref"].split("/")[-1]
            if ref_key in defs:
                resolved_props[prop_name] = defs[ref_key]
        else:
            resolved_props[prop_name] = prop_val

    # If no properties resolved (flat schema), return the schema itself as a single entry
    if not resolved_props and properties:
        resolved_props["parameters"] = {"type": "object", "properties": properties, "title": "Parameters", "required": schema.get("required", [])}

    return resolved_props


@app.route('/')
def index():
    return render_template('index.html', tools=DYNAMIC_TOOLS)


@app.route('/settings')
def settings():
    return render_template('settings.html', sse_url=CURRENT_SSE_URL)


@app.route('/tools-page')
def tools_page():
    """A dedicated page to browse and inspect MCP tools."""
    return render_template('tools_page.html', tools=DYNAMIC_TOOLS, sse_url=CURRENT_SSE_URL)

@app.route('/connections')
def connections_page():
    """A dedicated page to browse Caregence connections."""
    fetch_caregence_connections()
    return render_template('connections.html', connections=CAREGENCE_CONNECTIONS)


@app.route('/tool/<tool_name>')
def tool_form(tool_name):
    tool = next((t for t in DYNAMIC_TOOLS if t['name'] == tool_name), None)
    if not tool:
        return "Tool not found", 404
    # Pass the raw input_schema as JSON string so JS can handle complex discriminated unions
    raw_schema_json = json.dumps(tool.get("input_schema", {}))
    
    fetch_caregence_connections()
        
    return render_template('form.html', tool=tool, raw_schema_json=raw_schema_json, sse_url=CURRENT_SSE_URL, connections=CAREGENCE_CONNECTIONS)


@app.route('/execute/<tool_name>', methods=['POST'])
def execute_tool(tool_name):
    if request.is_json:
        data = request.json
    else:
        data = request.form.to_dict()
    return jsonify({
        "status": "success",
        "message": f"Tool '{tool_name}' executed successfully (Mock)",
        "payload": data
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
