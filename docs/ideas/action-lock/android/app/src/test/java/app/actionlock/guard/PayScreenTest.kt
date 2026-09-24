package app.actionlock.guard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Pay screens as the Accessibility service sees them (text of each node, in order). */
class PayScreenTest {
    // PhonePe chat with a contact, amount typed: from a real screen (Sept 2026).
    private val phonePe = listOf(
        ScreenNode("Tarun"),
        ScreenNode("+91 ••••• •5420"),
        ScreenNode("This user is not on PhonePe"),
        ScreenNode("Invite now", clickable = true),
        ScreenNode("₹12,050"),
        ScreenNode("PAID"),
        ScreenNode("8:20 PM"),
        ScreenNode("Transfer Money to"),
        ScreenNode("Banking name: TARUN SHARMA"),
        ScreenNode("XXXXXX5420@yescred"),
        ScreenNode("₹"),
        ScreenNode("3,000", editable = true),
        ScreenNode("6111", clickable = true),
        ScreenNode("PAY", clickable = true),
    )

    @Test
    fun readsPhonePePayeeAndTypedAmount() {
        val info = PayScreen.parse(phonePe)!!
        assertEquals("TARUN SHARMA", info.name)
        assertEquals(3000.0, info.amount!!, 0.0)
        assertEquals("XXXXXX5420@yescred", info.vpa)
        assertEquals(13, info.payButton)
    }

    @Test
    fun emptyAmountFieldIsNotTheOldChatAmount() {
        val empty = phonePe.map { if (it.editable) ScreenNode("Enter amount", editable = true) else it }
        assertNull(PayScreen.parse(empty)!!.amount)
    }

    @Test
    fun readsGooglePayScreens() {
        val entry = listOf(
            ScreenNode("Paying Tarun Sharma"),
            ScreenNode("Banking name : TARUN SHARMA"),
            ScreenNode("tarun.s@okaxis"),
            ScreenNode("₹"),
            ScreenNode("500", editable = true),
            ScreenNode("Add note", clickable = true),
            ScreenNode("Pay", clickable = true),
        )
        val a = PayScreen.parse(entry)!!
        assertEquals("TARUN SHARMA", a.name)
        assertEquals(500.0, a.amount!!, 0.0)

        val confirm = listOf(
            ScreenNode("Paying"),
            ScreenNode("Ravi Kumar"),
            ScreenNode("ravi.k@okaxis"),
            ScreenNode("Choose account to pay with"),
            ScreenNode("HDFC Bank ••6111", clickable = true),
            ScreenNode("Pay ₹1,250", clickable = true),
        )
        val b = PayScreen.parse(confirm)!!
        assertEquals("Ravi Kumar", b.name)
        assertEquals(1250.0, b.amount!!, 0.0)
    }

    @Test
    fun notAPayScreenWithoutAPayButton() {
        assertNull(PayScreen.parse(listOf(ScreenNode("Transfer Money to"), ScreenNode("Banking name: X Y"))))
    }
}
