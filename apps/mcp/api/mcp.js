import { handleMcpRequest } from "../mcpHandler.js";

export default async function handler(req, res) {
  await handleMcpRequest(req, res);
}
