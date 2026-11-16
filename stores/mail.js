import { defineStore } from 'pinia'

export const useMailStore = defineStore('mail', {
    state: () => ({
        mailContent: "",
        mailSender: "",
        mailSubject: "",
    }),
    actions: {
        /**
         * Updates the draft mail body.
         * @param {string} content
         */
        setMailContent(content) {
            this.mailContent = content
        },

        /**
         * Updates the draft sender email address.
         * @param {string} sender
         */
        setMailSender(sender) {
            this.mailSender = sender
        },

        /**
         * Updates the draft mail subject line.
         * @param {string} subject
         */
        setMailSubject(subject) {
            this.mailSubject = subject
        },

        /**
         * Clears the draft back to an empty state.
         */
        resetMail() {
            this.mailContent = ""
            this.mailSender = ""
            this.mailSubject = ""
        }
    }
})
