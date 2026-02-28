import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// د یادښت ډیټا ډول (Type)
interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // د اپلیکیشن له پیل سره سم خوندي شوي یادښتونه پورته کول
  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const savedNotes = await AsyncStorage.getItem('@notes');
      if (savedNotes) {
        setNotes(JSON.parse(savedNotes));
      }
    } catch (e) {
      console.log('Error loading notes', e);
    }
  };

  const saveNote = async () => {
    if (title.trim() === '' || content.trim() === '') return;
    
    const newNote = {
      id: Date.now().toString(),
      title,
      content,
      date: new Date().toLocaleDateString('ps-AF'), // پښتو نېټه
    };

    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    
    try {
      await AsyncStorage.setItem('@notes', JSON.stringify(updatedNotes));
      setIsAdding(false);
      setTitle('');
      setContent('');
    } catch (e) {
      console.log('Error saving note', e);
    }
  };

  const deleteNote = async (id: string) => {
    const updatedNotes = notes.filter(note => note.id !== id);
    setNotes(updatedNotes);
    try {
      await AsyncStorage.setItem('@notes', JSON.stringify(updatedNotes));
    } catch (e) {
      console.log('Error deleting note', e);
    }
  };

  // که کاروونکی نوی یادښت جوړوي
  if (isAdding) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.formContainer}>
          <Text style={styles.headerTitle}>نوی یادښت 📝</Text>
          <TextInput
            style={styles.inputTitle}
            placeholder="سرلیک دلته ولیکئ..."
            value={title}
            onChangeText={setTitle}
            textAlign="right"
          />
          <TextInput
            style={styles.inputContent}
            placeholder="د یادښت متن..."
            value={content}
            onChangeText={setContent}
            multiline
            textAlign="right"
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setIsAdding(false)}>
              <Text style={styles.cancelButtonText}>شاته 🔙</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={saveNote}>
              <Text style={styles.saveButtonText}>خوندي کول 💾</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // اصلي (کور) پاڼه
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.mainTitle}>زما یادښتونه 📚</Text>
      
      {notes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>تاسو تر اوسه هیڅ یادښت نه دی جوړ کړی.</Text>
        </View>
      ) : (
        <ScrollView style={styles.notesList}>
          {notes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <View style={styles.noteHeader}>
                <TouchableOpacity onPress={() => deleteNote(note.id)}>
                  <Text style={styles.deleteText}>❌ ړنګول</Text>
                </TouchableOpacity>
                <Text style={styles.noteTitle}>{note.title}</Text>
              </View>
              <Text style={styles.noteContent} numberOfLines={3}>{note.content}</Text>
              <Text style={styles.noteDate}>{note.date}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* د نوي یادښت جوړولو بټن */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsAdding(true)}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 20,
    color: '#2C3E50',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#7F8C8D',
  },
  notesList: {
    paddingHorizontal: 20,
  },
  noteCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34495E',
    textAlign: 'right',
  },
  deleteText: {
    color: '#E74C3C',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noteContent: {
    fontSize: 14,
    color: '#7F8C8D',
    textAlign: 'right',
    marginBottom: 10,
  },
  noteDate: {
    fontSize: 12,
    color: '#BDC3C7',
    textAlign: 'right',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: '#3498DB',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  fabIcon: {
    fontSize: 30,
    color: '#FFF',
    marginBottom: 5,
  },
  formContainer: {
    flex: 1,
    padding: 20,
    marginTop: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#2C3E50',
  },
  inputTitle: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    fontSize: 18,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  inputContent: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    flex: 1,
    textAlignVertical: 'top',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  cancelButton: {
    backgroundColor: '#95A5A6',
    padding: 15,
    borderRadius: 10,
    flex: 0.48,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#2ECC71',
    padding: 15,
    borderRadius: 10,
    flex: 0.48,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
