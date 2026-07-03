-- Migration: Existing servers were using Stalwart-compatible paths (/dav/cal/...)
-- but had server_type=1 (Radicale). Update them to server_type=2 (Stalwart).
UPDATE server_credentials SET server_type = 2 WHERE server_type = 1;
