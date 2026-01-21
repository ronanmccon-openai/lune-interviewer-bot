import { handleMcpHttpRequest } from "../../lib/mcpHttp.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleMcpHttpRequest;
export const POST = handleMcpHttpRequest;
export const OPTIONS = handleMcpHttpRequest;
