package com.daily.notes.ui.decoy

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.daily.notes.ui.NumberPad
import com.daily.notes.ui.PinDots

/**
 * A discreet numeric code entry used to reveal the control panel from the decoy
 * screen. Auto-submits once [codeLength] digits are entered.
 */
@Composable
fun CodeDialog(
    codeLength: Int,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Boolean,
) {
    var entered by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Enter passcode",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    if (error) "Incorrect passcode" else "Restricted area",
                    color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(22.dp))
                PinDots(count = entered.length.coerceAtMost(codeLength), total = codeLength)
                Spacer(Modifier.height(26.dp))
                NumberPad(
                    onDigit = { d ->
                        error = false
                        if (entered.length < codeLength) entered += d
                        if (entered.length >= codeLength) {
                            if (!onSubmit(entered)) {
                                error = true
                                entered = ""
                            }
                        }
                    },
                    onBackspace = { if (entered.isNotEmpty()) entered = entered.dropLast(1) }
                )
            }
        }
    }
}
