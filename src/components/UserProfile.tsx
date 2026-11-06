import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, LogOut, Mail } from 'lucide-react';
import { toast } from 'sonner';

const initialsOf = (text: string) =>
  text.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || '?';

interface UserProfileProps {
  onSaved?: (fullName: string) => void;
}

// Rendered inside the header's profile dialog. Only the name is editable -
// the email is the sign-in identity, so it's shown but not offered as a field.
const UserProfile: React.FC<UserProfileProps> = ({ onSaved }) => {
  const { user, signOut } = useAuth();
  const [savedName, setSavedName] = useState('');
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('Error fetching profile:', error);
        setSavedName(data?.full_name || '');
        setFullName(data?.full_name || '');
      });
  }, [user]);

  const trimmed = fullName.trim();
  const canSave = !!user && trimmed.length > 0 && trimmed !== savedName && !saving;

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: trimmed, email: user.email, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      console.error('Error updating profile:', error);
      toast.error('Could not update your name. Please try again.');
      return;
    }
    setSavedName(trimmed);
    setFullName(trimmed);
    toast.success('Name updated');
    onSaved?.(trimmed);
  };

  return (
    <form onSubmit={updateProfile} className="space-y-6">
      <DialogHeader>
        <DialogTitle>Your profile</DialogTitle>
        <DialogDescription>Change the name shown on your account.</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4 rounded-lg border bg-muted/40 p-4">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
            {initialsOf(savedName || user?.email || '')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold truncate">{savedName || 'No name set'}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{user?.email}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          maxLength={100}
          autoComplete="name"
        />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" onClick={signOut} className="text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
        <Button type="submit" disabled={!canSave}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default UserProfile;
