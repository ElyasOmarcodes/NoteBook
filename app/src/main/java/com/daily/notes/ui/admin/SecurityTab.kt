package com.daily.notes.ui.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.daily.notes.data.SettingsRepository
import com.daily.notes.receiver.AdminReceiver
import kotlinx.coroutines.launch

@Composable
fun SecurityTab(settings: SettingsRepository, actions: AdminActions) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val masterCode by settings.masterCode.collectAsStateWithLifecycle(initialValue = "")
    val unlockCode by settings.unlockCode.collectAsStateWithLifecycle(initialValue = "")

    SectionCard(
        title = "Control panel code",
        subtitle = "Long-press the “Notes” title on the home screen, then enter this code to return here."
    ) {
        CodeChanger(current = masterCode, onSave = { scope.launch { settings.setMasterCode(it) } })
    }

    SectionCard(
        title = "App unlock code",
        subtitle = "Entered on the lock screen to open a blocked app."
    ) {
        CodeChanger(current = unlockCode, onSave = { scope.launch { settings.setUnlockCode(it) } })
    }

    val rk = actions.refreshKey.intValue
    val deviceAdmin = remember(rk) { actions.isDeviceAdmin() }
    SectionCard(
        title = "Uninstall protection",
        subtitle = if (deviceAdmin) "On. The app cannot be uninstalled until you turn this off."
        else "Off. Turn on so the app can't be removed from the child's phone."
    ) {
        if (deviceAdmin) {
            OutlinedButton(
                onClick = { removeDeviceAdmin(context) },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Turn off protection (allow uninstall)") }
        } else {
            Button(
                onClick = actions.requestDeviceAdmin,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Turn on protection") }
        }
    }
}

@Composable
private fun CodeChanger(current: String, onSave: (String) -> Unit) {
    val context = LocalContext.current
    var value by remember(current) { mutableStateOf(current) }
    val valid = value.length in 4..8 && value.all { it.isDigit() }

    OutlinedTextField(
        value = value,
        onValueChange = { if (it.length <= 8 && it.all { c -> c.isDigit() }) value = it },
        label = { Text("Code (4–8 digits)") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth()
    )
    Spacer(Modifier.height(12.dp))
    Button(
        onClick = {
            onSave(value)
            Toast.makeText(context, "Code updated", Toast.LENGTH_SHORT).show()
        },
        enabled = valid && value != current,
        modifier = Modifier.fillMaxWidth()
    ) { Text("Save code") }
}

private fun removeDeviceAdmin(context: Context) {
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val component = ComponentName(context, AdminReceiver::class.java)
    if (dpm.isAdminActive(component)) {
        dpm.removeActiveAdmin(component)
        Toast.makeText(context, "Protection turned off", Toast.LENGTH_SHORT).show()
    }
}
