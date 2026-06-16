import asyncio
import httpx
import json
import os
from mcp.client.streamable_http import streamablehttp_client
from mcp import ClientSession

# Bypass SSL verification globally for self-signed certificates
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

async def main():
    url = "https://dev-mcp.caregence.ai/mcp"
    print(f"Connecting to: {url}")
    
    # Target paths relative to the script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "extracted_tools")
    all_tools_file = os.path.join(script_dir, "all_tools.json")
    
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        async with streamablehttp_client(url) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                print("Session initialized successfully!")
                
                result = await session.list_tools()
                tools = result.tools
                print(f"Found {len(tools)} tools.")
                
                tools_list = []
                for t in tools:
                    # Construct dictionary representing the tool
                    tool_dict = {
                        "name": t.name,
                        "description": t.description or "",
                        "input_schema": t.inputSchema if isinstance(t.inputSchema, dict) else (t.inputSchema.model_dump() if hasattr(t.inputSchema, 'model_dump') else {}),
                        "meta": t.meta if hasattr(t, 'meta') else {}
                    }
                    tools_list.append(tool_dict)
                    
                    # Store individual tool json
                    tool_file_path = os.path.join(output_dir, f"{t.name}.json")
                    with open(tool_file_path, "w", encoding="utf-8") as f:
                        json.dump(tool_dict, f, indent=2, ensure_ascii=False)
                    print(f"Saved individual tool: {tool_file_path}")
                
                # Store all tools in one json file
                with open(all_tools_file, "w", encoding="utf-8") as f:
                    json.dump(tools_list, f, indent=2, ensure_ascii=False)
                print(f"Saved all tools to: {all_tools_file}")
                
    except Exception as e:
        print(f"Error occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
