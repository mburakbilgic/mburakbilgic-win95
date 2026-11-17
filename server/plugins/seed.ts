export default defineNitroPlugin(() => {
  if (seedContentTree()) console.info('[seed] Content tree created under C:\\MBURAKBILGIC')
  if (ensureMailTree()) console.info('[seed] Mailbox created under C:\\MAIL')
  if (ensureSpamRulesFile()) console.info('[seed] Default spam rules written to C:\\MAIL\\SPAM.INI')
})
