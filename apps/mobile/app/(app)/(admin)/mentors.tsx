import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/src/lib/api';
import { Colors } from '@/src/theme';

type MentorAdmin = {
  id: string;
  name: string;
  bio: string | null;
  calendlyUrl: string;
  active: boolean;
  createdAt: string;
  _count: { consultations: number };
};

function MentorRow({ mentor, onToggle, onEdit }: {
  mentor: MentorAdmin;
  onToggle: (id: string, active: boolean) => void;
  onEdit: (mentor: MentorAdmin) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <View style={styles.rowHeader}>
          <Text style={styles.mentorName}>{mentor.name}</Text>
          <View style={[styles.activeBadge, mentor.active ? styles.activeBadgeOn : styles.activeBadgeOff]}>
            <Text style={[styles.activeBadgeText, mentor.active ? styles.activeBadgeTextOn : styles.activeBadgeTextOff]}>
              {mentor.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        {mentor.bio ? <Text style={styles.mentorBio} numberOfLines={2}>{mentor.bio}</Text> : null}
        <Text style={styles.mentorUrl} numberOfLines={1}>{mentor.calendlyUrl}</Text>
        <Text style={styles.consultCount}>{mentor._count.consultations} consultation{mentor._count.consultations !== 1 ? 's' : ''}</Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(mentor)}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mentor.active ? styles.toggleBtnOff : styles.toggleBtnOn]}
          onPress={() => onToggle(mentor.id, !mentor.active)}
        >
          <Text style={styles.toggleBtnText}>{mentor.active ? 'Deactivate' : 'Activate'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const EMPTY_FORM = { name: '', bio: '', calendlyUrl: '' };

export default function AdminMentorsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-mentors'],
    queryFn: () => api.get<{ mentors: MentorAdmin[] }>('/v1/admin/mentors'),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; bio?: string; calendlyUrl: string }) => api.post('/v1/admin/mentors', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-mentors'] }); closeModal(); },
    onError: (e: unknown) => Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to create mentor.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY_FORM & { active: boolean }> }) =>
      api.patch(`/v1/admin/mentors/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-mentors'] }); closeModal(); },
    onError: (e: unknown) => Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update mentor.'),
  });

  const mentors = data?.mentors ?? [];

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(mentor: MentorAdmin) {
    setEditingId(mentor.id);
    setForm({ name: mentor.name, bio: mentor.bio ?? '', calendlyUrl: mentor.calendlyUrl });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.name.trim() || !form.calendlyUrl.trim()) {
      Alert.alert('Required', 'Name and Calendly URL are required.');
      return;
    }
    const payload: { name: string; bio?: string; calendlyUrl: string } = {
      name: form.name.trim(),
      calendlyUrl: form.calendlyUrl.trim(),
      ...(form.bio.trim() ? { bio: form.bio.trim() } : {}),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const handleToggle = useCallback((id: string, active: boolean) => {
    updateMutation.mutate({ id, data: { active } });
  }, [updateMutation]);

  const renderItem = useCallback(({ item }: { item: MentorAdmin }) => (
    <MentorRow mentor={item} onToggle={handleToggle} onEdit={openEdit} />
  ), [handleToggle]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mentors</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.orange} size="large" />
        </View>
      ) : (
        <FlatList
          data={mentors}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={mentors.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No mentors yet</Text>
              <Text style={styles.emptySub}>Tap "+ Add" to create the first mentor</Text>
            </View>
          }
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Mentor' : 'New Mentor'}</Text>
            <ScrollView>
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder="Full name"
                placeholderTextColor={Colors.gray4}
              />
              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={form.bio}
                onChangeText={(t) => setForm((f) => ({ ...f, bio: t }))}
                placeholder="Short bio…"
                placeholderTextColor={Colors.gray4}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.fieldLabel}>Calendly URL *</Text>
              <TextInput
                style={styles.input}
                value={form.calendlyUrl}
                onChangeText={(t) => setForm((f) => ({ ...f, calendlyUrl: t }))}
                placeholder="https://calendly.com/…"
                placeholderTextColor={Colors.gray4}
                keyboardType="url"
                autoCapitalize="none"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: { paddingVertical: 4, minWidth: 60 },
  backText: { color: Colors.orange, fontSize: 16, fontFamily: 'Inter_500Medium' },
  title: { color: Colors.white, fontSize: 22, fontFamily: 'Poppins_700Bold' },
  addBtn: { backgroundColor: Colors.orange, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 60, alignItems: 'center' },
  addBtnText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  list: { paddingBottom: 40, paddingHorizontal: 16, gap: 12 },
  emptyContainer: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 40 },
  emptyTitle: { color: Colors.white, fontSize: 18, fontFamily: 'Poppins_700Bold' },
  emptySub: { color: Colors.gray4, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  row: {
    backgroundColor: Colors.navyCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gold + '22',
    padding: 14,
    gap: 10,
  },
  rowInfo: { gap: 4 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mentorName: { color: Colors.white, fontSize: 16, fontFamily: 'Inter_600SemiBold', flex: 1 },
  activeBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  activeBadgeOn: { backgroundColor: '#10B98122', borderColor: '#10B981' },
  activeBadgeOff: { backgroundColor: Colors.gray4 + '22', borderColor: Colors.gray4 },
  activeBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  activeBadgeTextOn: { color: '#10B981' },
  activeBadgeTextOff: { color: Colors.gray4 },
  mentorBio: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  mentorUrl: { color: Colors.gold, fontSize: 11, fontFamily: 'Inter_400Regular' },
  consultCount: { color: Colors.gray4, fontSize: 11, fontFamily: 'Inter_400Regular' },
  rowActions: { flexDirection: 'row', gap: 8 },
  editBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: Colors.gold + '44', paddingVertical: 8, alignItems: 'center' },
  editBtnText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  toggleBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  toggleBtnOn: { backgroundColor: '#10B98133' },
  toggleBtnOff: { backgroundColor: Colors.orangeDim },
  toggleBtnText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  modalSheet: {
    backgroundColor: Colors.navyCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
    maxHeight: '80%',
  },
  modalTitle: { color: Colors.white, fontSize: 20, fontFamily: 'Poppins_700Bold', marginBottom: 4 },
  fieldLabel: { color: Colors.gray3, fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  input: {
    backgroundColor: Colors.navy,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.white,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    marginBottom: 12,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray4, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { color: Colors.gray3, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { flex: 2, borderRadius: 10, backgroundColor: Colors.orange, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: Colors.orangeDim },
  saveBtnText: { color: Colors.white, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});
