package com.daily.notes.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.daily.notes.data.SettingsRepository
import kotlinx.coroutines.launch

@Composable
fun CallsTab(settings: SettingsRepository) {
    val scope = rememberCoroutineScope()
    val filterOn by settings.callFilterEnabled.collectAsStateWithLifecycle(initialValue = true)
    val whitelist by settings.whitelist.collectAsStateWithLifecycle(initialValue = emptySet())

    var name by remember { mutableStateOf("") }
    var number by remember { mutableStateOf("") }

    SectionCard(
        title = "Call filter",
        subtitle = "When on, only the numbers below can ring this phone. Everyone else is rejected."
    ) {
        ToggleRow(
            title = "Block unknown callers",
            description = if (filterOn) "Only allowed numbers can call." else "All calls are allowed.",
            checked = filterOn,
            onCheckedChange = { scope.launch { settings.setCallFilterEnabled(it) } }
        )
    }

    SectionCard(title = "Add an allowed number") {
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Name (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = number,
            onValueChange = { number = it },
            label = { Text("Phone number") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                val entry = buildEntry(name, number)
                if (entry.isNotBlank()) {
                    scope.launch { settings.addNumber(entry) }
                    name = ""; number = ""
                }
            },
            enabled = number.any { it.isDigit() },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Filled.PersonAdd, contentDescription = null)
            Spacer(Modifier.height(0.dp))
            Text("  Add to allow list")
        }
    }

    SectionCard(title = "Allowed numbers (${whitelist.size})") {
        if (whitelist.isEmpty()) {
            Text(
                "No numbers yet. With the filter on and this list empty, all calls are blocked.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                whitelist.sorted().forEach { entry ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(formatEntry(entry), modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface)
                        IconButton(onClick = { scope.launch { settings.removeNumber(entry) } }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

/** Stored as digits, optionally tagged with a name for display: "digits|name". */
private fun buildEntry(name: String, number: String): String {
    val digits = number.filter { it.isDigit() || it == '+' }
    val clean = name.trim()
    return if (clean.isEmpty()) digits else "$digits|$clean"
}

private fun formatEntry(entry: String): String {
    val parts = entry.split("|", limit = 2)
    return if (parts.size == 2) "${parts[1]}  ·  ${parts[0]}" else parts[0]
}
