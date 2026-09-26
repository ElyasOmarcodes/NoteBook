package com.daily.notes.ui.decoy

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import com.daily.notes.NotesApp
import com.daily.notes.ui.admin.AdminActivity
import com.daily.notes.ui.theme.NotesTheme

/**
 * The app's public face: an ordinary-looking notes app. It gives no hint that
 * it is a controller. The only way into the control panel is the hidden code
 * entry (long-press the "Notes" title) which checks the master code.
 */
class DecoyActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settings = (application as NotesApp).settings

        setContent {
            NotesTheme {
                val masterCode by settings.masterCode.collectAsStateWithLifecycle(initialValue = "")
                DecoyScreen(
                    codeLength = masterCode.length.coerceAtLeast(4),
                    onCodeEntered = { entered ->
                        if (masterCode.isNotEmpty() && entered == masterCode) {
                            startActivity(Intent(this, AdminActivity::class.java))
                            true
                        } else false
                    }
                )
            }
        }
    }
}
