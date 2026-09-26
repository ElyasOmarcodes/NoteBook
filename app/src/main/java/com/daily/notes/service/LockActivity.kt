package com.daily.notes.service

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import com.daily.notes.NotesApp
import com.daily.notes.ui.NumberPad
import com.daily.notes.ui.PinDots
import com.daily.notes.ui.theme.LockAccent
import com.daily.notes.ui.theme.LockBackground
import com.daily.notes.ui.theme.LockSurface
import com.daily.notes.ui.theme.NotesTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Full-screen lock displayed over a blocked app. Correct code grants a short
 * grace window; wrong code or Back returns the child to the home screen.
 */
class LockActivity : ComponentActivity() {

    private var lockedPackage: String = ""
    private var unlockCode: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lockedPackage = intent.getStringExtra(EXTRA_PACKAGE).orEmpty()

        val settings = (application as NotesApp).settings
        unlockCode = kotlinx.coroutines.runBlocking { settings.unlockCode.first() }

        // Back should send the child home, never into the blocked app.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goHome()
        })

        val appLabel = runCatching {
            val pm = packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(lockedPackage, 0)).toString()
        }.getOrDefault(getString(com.daily.notes.R.string.app_name))

        setContent {
            NotesTheme(forceDark = true) {
                Surface(color = LockBackground, modifier = Modifier.fillMaxSize()) {
                    LockScreen(
                        appLabel = appLabel,
                        codeLength = unlockCode.length.coerceAtLeast(4),
                        onSubmit = { entered ->
                            if (unlockCode.isNotEmpty() && entered == unlockCode) {
                                UnlockState.allow(lockedPackage)
                                finish()
                                true
                            } else false
                        },
                        onCancel = { goHome() }
                    )
                }
            }
        }
    }

    private fun goHome() {
        val home = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(home)
        finish()
    }

    companion object {
        const val EXTRA_PACKAGE = "extra_package"
    }
}

@androidx.compose.runtime.Composable
private fun LockScreen(
    appLabel: String,
    codeLength: Int,
    onSubmit: (String) -> Boolean,
    onCancel: () -> Unit,
) {
    var entered by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(24.dp))
            Box(
                modifier = Modifier.size(72.dp).clip(CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Surface(color = LockSurface, shape = CircleShape, modifier = Modifier.size(72.dp)) {}
                Icon(Icons.Filled.Lock, contentDescription = null, tint = LockAccent, modifier = Modifier.size(34.dp))
            }
            Spacer(Modifier.height(20.dp))
            Text(appLabel, color = Color.White, style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                if (error) "Wrong code, try again" else "Enter code to open",
                color = if (error) Color(0xFFFF8A8A) else Color(0xFFB9C2E0),
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(28.dp))
            PinDots(count = entered.length.coerceAtMost(codeLength), total = codeLength, color = LockAccent)
        }

        Column(modifier = Modifier.fillMaxWidth()) {
            NumberPad(
                onDigit = { d ->
                    error = false
                    if (entered.length < codeLength) entered += d
                    if (entered.length >= codeLength) {
                        if (onSubmit(entered)) {
                            // activity finishes
                        } else {
                            error = true
                            entered = ""
                        }
                    }
                },
                onBackspace = { if (entered.isNotEmpty()) entered = entered.dropLast(1) },
                keyColor = Color.White,
                keyBackground = LockSurface
            )
            Spacer(Modifier.height(20.dp))
            Text(
                "Cancel",
                color = Color(0xFF8C97BE),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(CircleShape)
                    .clickable { onCancel() }
                    .padding(12.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}
