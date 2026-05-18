
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from mcp.client.sse import sse_client
from mcp import ClientSession
import json
import asyncio

app = Flask(__name__)
CORS(app)

# Global tools list that can be updated dynamically from the MCP server
DYNAMIC_TOOLS = []
CURRENT_SSE_URL = "http://192.168.8.191:9090/sse"


async def fetch_tools_via_mcp(sse_url: str):
    """Use the official MCP Python client to connect and list tools."""


    print(f"[MCP] Connecting to: {sse_url}")
    async with sse_client(sse_url) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("[MCP] Session initialized, listing tools...")
            result = await session.list_tools()
            tools = result.tools
            print(f"[MCP] Found {len(tools)} tools")
            # Convert MCP Tool objects to plain dicts for storage/JSON
            tools_list = []
            for t in tools:
                print('============================')
                print(t.meta)
                print('============================')

                tool_dict = {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema if isinstance(t.inputSchema, dict) else (t.inputSchema.model_dump() if hasattr(t.inputSchema, 'model_dump') else {}),
                    "meta": t.meta
                }
                tools_list.append(tool_dict)
            return tools_list


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
        CURRENT_SSE_URL = sse_url
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


@app.route('/tool/<tool_name>')
def tool_form(tool_name):
    tool = next((t for t in DYNAMIC_TOOLS if t['name'] == tool_name), None)
    if not tool:
        return "Tool not found", 404
    # Pass the raw input_schema as JSON string so JS can handle complex discriminated unions
    raw_schema_json = json.dumps(tool.get("input_schema", {}))
    return render_template('form.html', tool=tool, raw_schema_json=raw_schema_json, sse_url=CURRENT_SSE_URL)


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
