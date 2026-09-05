-- Idempotency for khata transactions written from flaky/offline clients.
-- The client generates a stable UUID per intended write and replays it until it
-- gets through; the unique index makes duplicate replays a no-op at the DB level.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_shop_client_req_uniq
  ON transactions (shop_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
