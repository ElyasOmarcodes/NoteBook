import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plus, Save, ArrowLeft, Trash2 } from 'lucide-react-native';

// Types
interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
}

type Screen = 'Splash' | 'Home' | 'Editor';

// Main App Component
export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('Splash');
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  useEffect(() => {
    loadNotes();
    // Simulate Splash Screen delay
    const timer = setTimeout(() => {
      setCurrentScreen('Home');
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const loadNotes = async () => {
    try {
      const storedNotes = await AsyncStorage.getItem('@notes');
      if (storedNotes) {
        setNotes(JSON.parse(storedNotes));
      }
    } catch (e) {
      console.error('Failed to load notes', e);
    }
  };

  const saveNotes = async (newNotes: Note[]) => {
    try {
      await AsyncStorage.setItem('@notes', JSON.stringify(newNotes));
      setNotes(newNotes);
    } catch (e) {
      console.error('Failed to save notes', e);
    }
  };

  const handleSaveNote = (title: string, content: string) => {
    if (!title.trim() && !content.trim()) return;

    const newNote: Note = {
      id: editingNote ? editingNote.id : Date.now().toString(),
      title: title.trim() || 'بې سرلیکه', // Untitled in Pashto
      content: content.trim(),
      date: new Date().toLocaleDateString('ps-AF'), // Pashto date format
    };

    let updatedNotes;
    if (editingNote) {
      updatedNotes = notes.map(n => (n.id === editingNote.id ? newNote : n));
    } else {
      updatedNotes = [newNote, ...notes];
    }

    saveNotes(updatedNotes);
    setCurrentScreen('Home');
    setEditingNote(null);
  };

  const handleDeleteNote = (id: string) => {
    const updatedNotes = notes.filter(n => n.id !== id);
    saveNotes(updatedNotes);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Splash':
        return <SplashScreen />;
      case 'Home':
        return (
          <HomeScreen
            notes={notes}
            onAddNote={() => {
              setEditingNote(null);
              setCurrentScreen('Editor');
            }}
            onEditNote={(note: Note) => {
              setEditingNote(note);
              setCurrentScreen('Editor');
            }}
            onDeleteNote={handleDeleteNote}
          />
        );
      case 'Editor':
        return (
          <EditorScreen
            initialNote={editingNote}
            onSave={handleSaveNote}
            onCancel={() => {
              setEditingNote(null);
              setCurrentScreen('Home');
            }}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#F3F4F6" barStyle="dark-content" />
      {renderScreen()}
    </SafeAreaView>
  );
}

// --- Screens ---

const SplashScreen = () => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.9));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return (
    <View style={styles.splashContainer}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>📝</Text>
        </View>
        <Text style={styles.splashTitle}>یادښتونه</Text>
        <Text style={styles.splashSubtitle}>ستاسو خپل شخصي کتابچه</Text>
      </Animated.View>
    </View>
  );
};

const HomeScreen = ({ notes, onAddNote, onEditNote, onDeleteNote }: any) => {
  const renderItem = ({ item }: { item: Note }) => (
    <TouchableOpacity
      style={styles.noteCard}
      activeOpacity={0.7}
      onPress={() => onEditNote(item)}
    >
      <View style={styles.noteHeader}>
        <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
        <TouchableOpacity onPress={() => onDeleteNote(item.id)} style={styles.deleteButton}>
          <Trash2 size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <Text style={styles.noteContent} numberOfLines={2}>{item.content}</Text>
      <Text style={styles.noteDate}>{item.date}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screenContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>کور پاڼه</Text>
      </View>

      {notes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyText}>هیڅ یادښت شتون نلري</Text>
          <Text style={styles.emptySubText}>د نوي یادښت جوړولو لپاره لاندې تڼۍ کیکاږئ</Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={onAddNote}>
        <Plus size={32} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const EditorScreen = ({ initialNote, onSave, onCancel }: any) => {
  const [title, setTitle] = useState(initialNote?.title || '');
  const [content, setContent] = useState(initialNote?.content || '');

  return (
    <View style={styles.screenContainer}>
      <View style={styles.editorHeader}>
        <TouchableOpacity style={styles.iconButton} onPress={onCancel}>
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{initialNote ? 'یادښت ایډیټ کړئ' : 'نوی یادښت'}</Text>
        <TouchableOpacity
          style={[styles.saveButton, (!title.trim() && !content.trim()) && styles.saveButtonDisabled]}
          onPress={() => onSave(title, content)}
          disabled={!title.trim() && !content.trim()}
        >
          <Save size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>خوندي کول</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.editorContent}>
        <TextInput
          style={styles.titleInput}
          placeholder="سرلیک..."
          placeholderTextColor="#9CA3AF"
          value={title}
          onChangeText={setTitle}
          textAlign="right"
        />
        <TextInput
          style={styles.contentInput}
          placeholder="خپل یادښت دلته ولیکئ..."
          placeholderTextColor="#9CA3AF"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          textAlign="right"
        />
      </View>
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    // In a real Expo app, we would use I18nManager.forceRTL(true)
    // For this web preview, we ensure RTL flow using flexDirection
    direction: 'rtl',
  },
  screenContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  // Splash Screen
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  iconContainer: {
    width: 100,
    height: 100,
    backgroundColor: '#E0E7FF',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  },
  iconText: {
    fontSize: 50,
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  splashSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  // Home Screen
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 24 : 16,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'right',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  noteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  noteHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    textAlign: 'right',
  },
  deleteButton: {
    padding: 4,
  },
  noteContent: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 12,
    textAlign: 'right',
  },
  noteDate: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'left',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    left: 32, // Left side for RTL
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  // Editor Screen
  editorHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 16,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  editorContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
    padding: 0,
  },
  contentInput: {
    flex: 1,
    fontSize: 18,
    color: '#374151',
    lineHeight: 28,
    padding: 0,
  },
});
