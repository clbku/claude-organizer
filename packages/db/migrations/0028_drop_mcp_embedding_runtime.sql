-- embedding_runtime was repurposed (CO-307): it now holds a single row written by
-- the dedicated embedding service (service='embedding'), and the per-process MCP
-- tracking was removed. A deployment that ran the old MCP may have left a legacy
-- 'mcp' row; nothing reads it anymore, so drop it.
DELETE FROM "embedding_runtime" WHERE "service" = 'mcp';
