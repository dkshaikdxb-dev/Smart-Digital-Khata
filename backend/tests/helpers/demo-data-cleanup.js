// Put the shared test database back the way the demo data loader found it.
//
// Deleting the demo owner users cascades to their shops and everything under
// them, which used to be the whole cleanup. It is not any more: the loader now
// also brands the flagship demo shop, which means rows OUTSIDE that cascade —
// a self-serve ad_campaign (link_shop_id is ON DELETE SET NULL, so deleting the
// shop orphans the campaign into later suites' promo serving instead of
// removing it), the shop's wallet and ledger (referral_wallets.owner_id carries
// no FK at all), and the moderation_actions rows that record the approvals.
//
// Every suite that runs loadDemoData() calls this, so there is one idea of what
// "clean afterwards" means rather than one per suite.
async function clearDemoData(pool) {
  const owned = await pool.query(
    "SELECT shop_id FROM users WHERE email LIKE 'store%@demo.local' AND shop_id IS NOT NULL"
  );
  const shopIds = owned.rows.map((r) => r.shop_id);

  if (shopIds.length) {
    const campaigns = await pool.query(
      'SELECT id FROM ad_campaigns WHERE link_shop_id = ANY($1::uuid[])',
      [shopIds]
    );
    const campaignIds = campaigns.rows.map((r) => r.id);
    if (campaignIds.length) {
      // Targets cascade with the campaign.
      await pool.query('DELETE FROM ad_campaigns WHERE id = ANY($1::uuid[])', [campaignIds]);
    }
    await pool.query(
      'DELETE FROM moderation_actions WHERE target_id = ANY($1::uuid[]) OR target_id = ANY($2::uuid[])',
      [shopIds, campaignIds]
    );
    await pool.query(
      `DELETE FROM referral_ledger WHERE wallet_id IN
         (SELECT id FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = ANY($1::uuid[]))`,
      [shopIds]
    );
    await pool.query(
      "DELETE FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = ANY($1::uuid[])",
      [shopIds]
    );
  }

  await pool.query("DELETE FROM ad_campaigns WHERE advertiser = 'Smart Khata'");
  await pool.query("DELETE FROM users WHERE email LIKE 'store%@demo.local'");
}

module.exports = { clearDemoData };
