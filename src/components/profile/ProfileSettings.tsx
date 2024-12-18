import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserCog } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { useSupabase } from "@/providers/SupabaseProvider";
import { AvatarUpload } from "@/components/auth/AvatarUpload";

export const ProfileSettings = () => {
  const { user } = useSupabase();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatar(file);
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatar) return null;

    const fileExt = avatar.name.split('.').pop();
    const filePath = `${userId}/profile.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatar, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      console.error('Error uploading avatar:', error.message);
      return null;
    }
  };

  const createProfile = async (userId: string) => {
    console.log('Creating new profile for user:', userId);
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert([{ id: userId }])
      .select()
      .single();

    if (createError) {
      console.error('Error creating profile:', createError);
      throw createError;
    }

    console.log('Created new profile:', newProfile);
    return newProfile;
  };

  const loadProfile = async () => {
    if (!user?.id) return;

    try {
      console.log('Loading profile for user:', user.id);
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('name, phone, company, role, bio, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching profile:', fetchError);
        throw fetchError;
      }

      if (!existingProfile) {
        console.log('Profile not found, creating new one');
        await createProfile(user.id);
        setName("");
        setPhone("");
        setCompany("");
        setRole("");
        setBio("");
        setAvatarUrl("");
        return;
      }

      console.log('Loaded existing profile:', existingProfile);
      setName(existingProfile.name || "");
      setPhone(existingProfile.phone || "");
      setCompany(existingProfile.company || "");
      setRole(existingProfile.role || "");
      setBio(existingProfile.bio || "");
      setAvatarUrl(existingProfile.avatar_url || "");
    } catch (error: any) {
      console.error('Error in loadProfile:', error);
      toast({
        title: "Erro ao carregar perfil",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const avatarUrl = await uploadAvatar(user.id);

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name,
          phone,
          company,
          role,
          bio,
          avatar_url: avatarUrl || undefined,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: "Perfil atualizado!",
        description: "Suas informações foram atualizadas com sucesso.",
        className: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar perfil",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => open && loadProfile()}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <UserCog className="h-4 w-4" />
          Configurar Perfil
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Configurações do Perfil</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <AvatarUpload
            avatarUrl={avatarUrl}
            onAvatarChange={handleAvatarChange}
          />
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Seu número de telefone"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Empresa/Escritório</Label>
            <Input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nome da sua empresa ou escritório"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Cargo</Label>
            <Input
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Seu cargo ou função"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Biografia</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Uma breve descrição sobre você"
              className="resize-none"
              rows={3}
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            disabled={isLoading}
          >
            {isLoading ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};