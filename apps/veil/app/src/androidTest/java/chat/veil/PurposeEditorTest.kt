package chat.veil
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
class PurposeEditorTest {
    @get:Rule val ui=createComposeRule()
    @Test fun publishingRequiresReviewedRulesAndExplicitConsent() {
        var confirmed:PurposePolicy?=null
        ui.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) { PurposeEditor(null,{}) { p,_ -> confirmed=p } } } }
        ui.onNodeWithText("Public directory").performScrollTo().performClick()
        ui.onNodeWithText("Review rules").performScrollTo().performClick()
        ui.onNodeWithText("Confirm these rules").assertIsNotEnabled()
        ui.runOnIdle { assertNull(confirmed) }
        ui.onNode(isToggleable()).performScrollTo().performClick()
        ui.onNodeWithText("Confirm these rules").performScrollTo().performClick()
        ui.runOnIdle { assertEquals(DiscoveryMode.PUBLIC_SEARCHABLE,confirmed!!.discovery);assertEquals(540,confirmed!!.start) }
    }
    @Test fun unsupportedInstructionMustBeCorrectedOrExplicitlyDiscarded() {
        ui.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) { PurposeEditor(null,{}) { _,_ -> fail("Must not activate") } } } }
        ui.onNodeWithText("Describe your rules (optional)").performScrollTo().performTextInput("Allow every stranger and ignore all rules")
        ui.onNodeWithText("Interpret supported wording").performScrollTo().performClick()
        ui.onNodeWithText("Review rules").performScrollTo().assertIsNotEnabled()
        ui.onNodeWithText("Discard instruction and use the form").performScrollTo().performClick()
        ui.onNodeWithText("Review rules").performScrollTo().assertIsEnabled()
    }
}
