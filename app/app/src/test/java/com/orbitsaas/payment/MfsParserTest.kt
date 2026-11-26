package com.orbitsaas.payment

import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.SenderTrust
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import com.orbitsaas.payment.interceptors.parsers.ParseOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests validating MfsParser against the full sms-samples.json corpus and SenderTrust anti-spoofing rules.
 */
class MfsParserTest {

    @Test
    fun testBkashPersonalSendMoney() {
        val sms = "You have received Tk 1,000.00 from 01712345678. Ref 123. Fee Tk 0.00. Balance Tk 5,000.00. TrxID BK12AB34CD at 25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_BKASH, tx.provider)
        assertEquals("BK12AB34CD", tx.trxId)
        assertEquals(1000.0, tx.amount, 0.001)
        assertEquals("01712345678", tx.senderNumber)
        assertEquals("bKash", tx.smsSender)
        assertEquals(SmsEntity.SOURCE_SMS, tx.source)
    }

    @Test
    fun testBkashPraPayment() {
        val sms = "You have received payment Tk 500.00 from 01712345678. Fee Tk 0.00. Balance Tk 2,000.00. TrxID BK99ZZ11QQ at 25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_BKASH, tx.provider)
        assertEquals("BK99ZZ11QQ", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01712345678", tx.senderNumber)
    }

    @Test
    fun testBkashCashIn() {
        val sms = "Cash In Tk 500.00 from 01712345678 successful. Fee Tk 0.00. Balance Tk 2,500.00. TrxID BKCASH1234 at 25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_BKASH, tx.provider)
        assertEquals("BKCASH1234", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01712345678", tx.senderNumber)
    }

    @Test
    fun testNagadKeyValueMultiline() {
        val sms = "Money Received.\nAmount: Tk 500\nSender: 01812345678\nRef: N/A\nTxnID: 71A2B3C4\nBalance: Tk 1,500.00\n25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "NAGAD", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_NAGAD, tx.provider)
        assertEquals("71A2B3C4", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01812345678", tx.senderNumber)
    }

    @Test
    fun testNagadStandard() {
        val sms = "You have received BDT 500.00 from 01812345678. Fee: BDT 0.00. Balance: BDT 2,100.00. TxnID: 7XYZABC9 25/11/2026 14:35"
        val outcome = MfsParser.parse(sms, "NAGAD", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_NAGAD, tx.provider)
        assertEquals("7XYZABC9", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01812345678", tx.senderNumber)
    }

    @Test
    fun testRocketReal16216Format() {
        val sms = "Tk500.00 received from A/C:01912345678X Fee:Tk0.00, Your A/C Balance: Tk1,500.00 TxnId:1234567890 Date:25-NOV-26 06:00:00 pm."
        val outcome = MfsParser.parse(sms, "16216", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_ROCKET, tx.provider)
        assertEquals("1234567890", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01912345678", tx.senderNumber)
    }

    @Test
    fun testRocketLegacyFormat() {
        val sms = "You have received Tk 500.00 from 019111111112. Fee Tk 0.00. Balance Tk 3,443.15. TrxID ADB3DB1GHF at 18/11/2026 19:17"
        val outcome = MfsParser.parse(sms, "Rocket", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_ROCKET, tx.provider)
        assertEquals("ADB3DB1GHF", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01911111111", tx.senderNumber)
    }

    @Test
    fun testUpayStandard() {
        val sms = "You have received Tk. 500.00 from 01612345678. Balance Tk. 1,500.00. TrxID UP87912ABC at 25/11/2026 15:10"
        val outcome = MfsParser.parse(sms, "upay", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_UPAY, tx.provider)
        assertEquals("UP87912ABC", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01612345678", tx.senderNumber)
    }

    @Test
    fun testCellfinStandard() {
        val sms = "You have received Tk 1,200.00 from 01712345678. Balance Tk 4,500.00. TrxID CF9812481"
        val outcome = MfsParser.parse(sms, "CellFin", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_CELLFIN, tx.provider)
        assertEquals("CF9812481", tx.trxId)
        assertEquals(1200.0, tx.amount, 0.001)
        assertEquals("01712345678", tx.senderNumber)
    }

    @Test
    fun testAmountTrailingPeriod() {
        val sms = "You have received Tk 500. from 01712345678. TrxID BKDOT12345 at 25/11/2026"
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Accepted)
        val tx = (outcome as ParseOutcome.Accepted).transaction
        assertEquals(SmsEntity.PROVIDER_BKASH, tx.provider)
        assertEquals("BKDOT12345", tx.trxId)
        assertEquals(500.0, tx.amount, 0.001)
        assertEquals("01712345678", tx.senderNumber)
    }

    @Test
    fun testSpoofPersonalNumberWithPlus88Rejected() {
        val sms = "You have received Tk 1,000.00 from 01712345678. Ref 123. Fee Tk 0.00. Balance Tk 5,000.00. TrxID BK12AB34CD at 25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "+8801712345678", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Rejected)
        assertEquals(SmsEntity.PROVIDER_BKASH, (outcome as ParseOutcome.Rejected).provider)
    }

    @Test
    fun testSpoofPersonalNumberWithoutPlus88Rejected() {
        val sms = "You have received Tk 1,000.00 from 01712345678. Ref 123. Fee Tk 0.00. Balance Tk 5,000.00. TrxID BK12AB34CD at 25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "01712345678", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Rejected)
    }

    @Test
    fun testSpoofProviderMismatchRejected() {
        val sms = "You have received BDT 500.00 from 01812345678. Fee: BDT 0.00. Balance: BDT 2,100.00. TxnID: 7XYZABC9 25/11/2026 14:35"
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.Rejected)
        assertEquals(SmsEntity.PROVIDER_NAGAD, (outcome as ParseOutcome.Rejected).provider)
    }

    @Test
    fun testOutgoingSendMoneyRejected() {
        val sms = "Send Money Tk 500.00 to 01712345678 successful. Fee Tk 0.00. Balance Tk 1,000.00. TrxID BKOUT12345 at 25/11/2026 18:00"
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.NotPayment)
    }

    @Test
    fun testBkashOtpSmsRejected() {
        val sms = "Your bKash verification code is 123456. Please do not share this code with anyone."
        val outcome = MfsParser.parse(sms, "bKash", SmsEntity.SOURCE_SMS)

        assertTrue(outcome is ParseOutcome.NotPayment)
    }

    @Test
    fun testExtraTrustedSendersAndPersonalPhoneOverrideBlocked() {
        val extras = "BKASH:bKashAlert,NAGAD:16167,BKASH:01712345678"

        val nagadExtra = SenderTrust.evaluate("16167", SmsEntity.SOURCE_SMS, extras)
        assertTrue(nagadExtra.trusted)
        assertEquals(SmsEntity.PROVIDER_NAGAD, nagadExtra.provider)

        val bkashExtra = SenderTrust.evaluate("bKashAlert", SmsEntity.SOURCE_SMS, extras)
        assertTrue(bkashExtra.trusted)
        assertEquals(SmsEntity.PROVIDER_BKASH, bkashExtra.provider)

        // Personal phone numbers must ALWAYS be rejected even if present in extras
        val personalOverride = SenderTrust.evaluate("01712345678", SmsEntity.SOURCE_SMS, extras)
        assertFalse(personalOverride.trusted)
    }

    @Test
    fun testLongNumericSenderRejectedUnlessTrusted() {
        val untrustedNumeric = SenderTrust.evaluate("1234567", SmsEntity.SOURCE_SMS, "")
        assertFalse(untrustedNumeric.trusted)

        val trustedShortcode = SenderTrust.evaluate("16216", SmsEntity.SOURCE_SMS, "")
        assertTrue(trustedShortcode.trusted)
        assertEquals(SmsEntity.PROVIDER_ROCKET, trustedShortcode.provider)
    }

    @Test
    fun testTrustedPackagesExactMatchOnly() {
        assertTrue(SenderTrust.isTrustedPackage("com.bkash.customerapp"))
        assertTrue(SenderTrust.isTrustedPackage("com.bkash.merchantapp"))
        assertTrue(SenderTrust.isTrustedPackage("com.konasl.nagad"))
        assertTrue(SenderTrust.isTrustedPackage("com.konasl.nagad.merchant"))
        assertTrue(SenderTrust.isTrustedPackage("com.dbbl.mbb.rocket"))
        assertTrue(SenderTrust.isTrustedPackage("bd.com.upay.customer"))
        assertTrue(SenderTrust.isTrustedPackage("com.ibbl.cellfin"))

        // Substring spoof packages must be rejected
        assertFalse(SenderTrust.isTrustedPackage("com.evil.bkash.clone"))
        assertFalse(SenderTrust.isTrustedPackage("org.nagad.spoof"))

        val notifSms = "You have received Tk 500.00 from 01712345678. TrxID BKNOTIF11 at 25/11/2026"
        val spoofOutcome = MfsParser.parse(notifSms, "com.evil.bkash.clone", SmsEntity.SOURCE_NOTIFICATION)
        assertTrue(spoofOutcome is ParseOutcome.Rejected)
    }

    @Test
    fun testPhoneNumberSanitization() {
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("+8801711111111"))
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("8801711111111"))
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("+88 01711-111111"))
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("01711111111"))
        assertEquals("01912345678", MfsParser.sanitizePhoneNumber("01912345678X", SmsEntity.PROVIDER_ROCKET))
        assertEquals("01911111111", MfsParser.sanitizePhoneNumber("019111111112", SmsEntity.PROVIDER_ROCKET))
    }

    @Test
    fun testIrrelevantSmsIgnored() {
        val spam = "Recharge 20 Tk and get 1GB internet for 3 days! Dial *121# now."
        assertTrue(MfsParser.parse(spam, "GP", SmsEntity.SOURCE_SMS) is ParseOutcome.NotPayment)

        val bankOtp = "Your OTP for internet banking login is 492019. Valid for 3 minutes."
        assertTrue(MfsParser.parse(bankOtp, "EBL", SmsEntity.SOURCE_SMS) is ParseOutcome.NotPayment)
    }
}
