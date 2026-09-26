package com.daily.notes.ui.decoy

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class Note(val title: String, val body: String, val tint: Color)

private val sampleNotes = listOf(
    Note("Shopping", "Bread, milk, eggs, apples and a jar of honey.", Color(0xFFFFF3D6)),
    Note("Ideas", "Weekend trip to the lake. Pack the picnic basket.", Color(0xFFDDECFF)),
    Note("Reading", "Chapter 4 — the part about the old lighthouse.", Color(0xFFE7F8E9)),
    Note("Homework", "Maths page 12, exercises 3 to 8. Due Thursday.", Color(0xFFFDE4EC)),
    Note("Recipe", "Warm the butter, fold in the flour, rest 20 min.", Color(0xFFEDE7FF)),
    Note("To do", "Water the plants. Call grandma. Fix the shelf.", Color(0xFFFFEAD6)),
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun DecoyScreen(codeLength: Int, onCodeEntered: (String) -> Boolean) {
    var showCodeDialog by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            FloatingActionButton(
                onClick = { /* new note — cosmetic */ },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = Color.White
            ) { Icon(Icons.Filled.Add, contentDescription = "New note") }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp)
        ) {
            Spacer(Modifier.height(12.dp))
            // The title carries the hidden entry: a long-press opens the code pad.
            Text(
                text = "Notes",
                style = MaterialTheme.typography.headlineSmall.copy(fontSize = 30.sp, fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .padding(vertical = 4.dp)
                    .combinedClickable(
                        onClick = { },
                        onLongClick = { showCodeDialog = true }
                    )
            )
            Text(
                text = "${sampleNotes.size} notes",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp
            )
            Spacer(Modifier.height(16.dp))
            SearchBar()
            Spacer(Modifier.height(16.dp))
            LazyVerticalStaggeredGrid(
                columns = StaggeredGridCells.Fixed(2),
                verticalItemSpacing = 14.dp,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                contentPadding = PaddingValues(bottom = 96.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(sampleNotes) { note -> NoteCard(note) }
            }
        }
    }

    if (showCodeDialog) {
        CodeDialog(
            codeLength = codeLength,
            onDismiss = { showCodeDialog = false },
            onSubmit = { code ->
                val ok = onCodeEntered(code)
                if (ok) showCodeDialog = false
                ok
            }
        )
    }
}

@Composable
private fun SearchBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Filled.Search,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.size(10.dp))
        Text("Search notes", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NoteCard(note: Note) {
    Card(
        colors = CardDefaults.cardColors(containerColor = note.tint),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp).heightIn(min = 90.dp)) {
            Text(note.title, fontWeight = FontWeight.SemiBold, color = Color(0xFF2A2E3A), fontSize = 16.sp)
            Spacer(Modifier.height(8.dp))
            Text(note.body, color = Color(0xFF4A4F5E), fontSize = 13.sp)
        }
    }
}
