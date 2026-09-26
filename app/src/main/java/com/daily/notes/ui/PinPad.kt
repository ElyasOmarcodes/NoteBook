package com.daily.notes.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** A row of PIN dots reflecting how many digits have been entered. */
@Composable
fun PinDots(count: Int, total: Int = 4, color: Color = MaterialTheme.colorScheme.primary) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        repeat(total) { i ->
            val filled = i < count
            val target = if (filled) 16.dp else 12.dp
            val size by animateDpAsState(targetValue = target, label = "dot")
            Box(
                modifier = Modifier
                    .size(size)
                    .clip(CircleShape)
                    .background(if (filled) color else color.copy(alpha = 0.25f))
            )
        }
    }
}

/**
 * A numeric keypad. [onDigit] fires for 0-9, [onBackspace] for delete.
 */
@Composable
fun NumberPad(
    onDigit: (String) -> Unit,
    onBackspace: () -> Unit,
    keyColor: Color = MaterialTheme.colorScheme.onSurface,
    keyBackground: Color = MaterialTheme.colorScheme.surfaceVariant,
) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("", "0", "<")
    )
    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        rows.forEach { row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row.forEach { key ->
                    Box(modifier = Modifier.weight(1f).aspectRatio(1.35f), contentAlignment = Alignment.Center) {
                        when (key) {
                            "" -> {}
                            "<" -> KeyCircle(background = Color.Transparent, onClick = onBackspace) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Backspace,
                                    contentDescription = "Delete",
                                    tint = keyColor
                                )
                            }
                            else -> KeyCircle(background = keyBackground, onClick = { onDigit(key) }) {
                                Text(
                                    text = key,
                                    color = keyColor,
                                    fontSize = 26.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KeyCircle(
    background: Color,
    onClick: () -> Unit,
    content: @Composable () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .padding(6.dp)
            .clip(CircleShape)
            .background(background)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) { content() }
}
