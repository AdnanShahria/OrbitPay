package com.orbitsaas.payment

import com.orbitsaas.payment.data.local.SmsEntity
import com.orbitsaas.payment.interceptors.parsers.MfsParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Unit tests validating regex extraction across all Bangladeshi MFS telecom SMS variants.
 */
class MfsParserTest {

    @Test
    fun testBkashPersonalSendMoneyExtraction() {
        val sms = "You have received Tk 1,250.00 from 01711111111. Ref . Fee Tk 0.00. Balance Tk 5,420.00. TrxID 9GB7XQ21 at 18/11/2026 14:30"
        val parsed = MfsParser.parse(sms, "bKash")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_BKASH, parsed!!.provider)
        assertEquals("9GB7XQ21", parsed.trxId)
        assertEquals(1250.00, parsed.amount, 0.001)
        assertEquals("01711111111", parsed.senderNumber)
    }

    @Test
    fun testBkashPraPaymentExtraction() {
        val sms = "Payment received Tk 500.00 from 01712345678. TrxID 9GB88AA1 at 18/11/2026 15:00. Balance Tk 10,200.00."
        val parsed = MfsParser.parse(sms, "16247")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_BKASH, parsed!!.provider)
        assertEquals("9GB88AA1", parsed.trxId)
        assertEquals(500.00, parsed.amount, 0.001)
        assertEquals("01712345678", parsed.senderNumber)
    }

    @Test
    fun testNagadStandardBdtExtraction() {
        val sms = "You have received BDT 750.50 from 01811111111. Fee: BDT 0.00. Balance: BDT 3,100.00. TxnID: 7XYZABC9 18/11/2026 14:35"
        val parsed = MfsParser.parse(sms, "Nagad")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_NAGAD, parsed!!.provider)
        assertEquals("7XYZABC9", parsed.trxId)
        assertEquals(750.50, parsed.amount, 0.001)
        assertEquals("01811111111", parsed.senderNumber)
    }

    @Test
    fun testNagadAltFormatExtraction() {
        val sms = "Amount: Tk 300.00. Sender: 01899999999. TxnID: 8KLMNOP1 at 18/11/2026"
        val parsed = MfsParser.parse(sms, "16167")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_NAGAD, parsed!!.provider)
        assertEquals("8KLMNOP1", parsed.trxId)
        assertEquals(300.00, parsed.amount, 0.001)
        assertEquals("01899999999", parsed.senderNumber)
    }

    @Test
    fun testRocket12DigitWalletExtraction() {
        val sms = "You have received Tk 2,500.00 from 019111111112. Fee Tk 0.00. Balance Tk 3,443.15. TrxID ADB3DB1GHF at 18/11/2026 19:17"
        val parsed = MfsParser.parse(sms, "16216")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_ROCKET, parsed!!.provider)
        assertEquals("ADB3DB1GHF", parsed.trxId)
        assertEquals(2500.00, parsed.amount, 0.001)
        assertEquals("019111111112", parsed.senderNumber)
    }

    @Test
    fun testUpayExtraction() {
        val sms = "You have received Tk 450.00 from 01611111111. Fee Tk 0.00. Balance Tk 1,500.00. TrxID UP87912ABC at 18/11/2026 15:10"
        val parsed = MfsParser.parse(sms, "upay")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_UPAY, parsed!!.provider)
        assertEquals("UP87912ABC", parsed.trxId)
        assertEquals(450.00, parsed.amount, 0.001)
        assertEquals("01611111111", parsed.senderNumber)
    }

    @Test
    fun testCellfinExtraction() {
        val sms = "You have received Tk 1,200.00 from 01712345678. Balance Tk 4,500.00. TrxID CF9812481"
        val parsed = MfsParser.parse(sms, "IBBL")

        assertNotNull(parsed)
        assertEquals(SmsEntity.PROVIDER_CELLFIN, parsed!!.provider)
        assertEquals("CF9812481", parsed.trxId)
        assertEquals(1200.00, parsed.amount, 0.001)
        assertEquals("01712345678", parsed.senderNumber)
    }

    @Test
    fun testPhoneNumberSanitization() {
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("+8801711111111"))
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("8801711111111"))
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("+88 01711-111111"))
        assertEquals("01711111111", MfsParser.sanitizePhoneNumber("01711111111"))
        assertEquals("019111111112", MfsParser.sanitizePhoneNumber("+88019111111112")) // Rocket 12-digit
    }

    @Test
    fun testIrrelevantSmsIgnored() {
        val spam = "Recharge 20 Tk and get 1GB internet for 3 days! Dial *121# now."
        val parsed = MfsParser.parse(spam, "GP")
        assertNull(parsed)

        val bankOtp = "Your OTP for internet banking login is 492019. Valid for 3 minutes."
        val parsedOtp = MfsParser.parse(bankOtp, "EBL")
        assertNull(parsedOtp)
    }
}
