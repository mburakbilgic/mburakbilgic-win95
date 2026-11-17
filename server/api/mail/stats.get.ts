const MAIL_STATS_DAYS = 30
const MAIL_STATS_TOP_REASONS = 10

export default defineEventHandler((event) => {
  requireAdmin(event)
  return mailStats(MAIL_STATS_DAYS, MAIL_STATS_TOP_REASONS)
})
