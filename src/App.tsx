import React, { useState, useEffect } from 'react';
import {
  Send,
  Layout,
  User,
  Cpu,
  Sparkles,
  Copy,
  RefreshCw,
  Check,
  FileText,
  ChevronRight,
  Database,
  Zap,
  Eye,
  EyeOff,
  Lock,
  Mail,
  LogOut,
  UserPlus,
  Settings,
  X,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateLinkedInContent, LinkedInPost, summarizeCV } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './lib/supabase';

import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [profile, setProfile] = useState(() => localStorage.getItem('dc_ai_profile') || '');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Profesional y Técnico');
  const [isGenerating, setIsGenerating] = useState(false);
  const [post, setPost] = useState<LinkedInPost | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // App Auth State (Supabase)
  const [user, setUser] = useState<any>(null);
  const [isLinkedInUser, setIsLinkedInUser] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Profile Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ type: '', text: '' });
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Supabase getSession error:', error.message);
        alert(`Error al conectar con Supabase: ${error.message}. Verifica tu conexión o si hay un bloqueador de anuncios activo.`);
      }
      setUser(session?.user ?? null);
      setIsCheckingAuth(false);
    }).catch(err => {
      console.error('Supabase getSession critical error:', err);
      alert('Error crítico de red al conectar con Supabase. Esto suele ser causado por un bloqueador de anuncios (como Brave Shield o uBlock) o un firewall.');
      setIsCheckingAuth(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isLinkedInUser) {
        setUser(session?.user ?? null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile();
      checkConnection();
    } else {
      setProfile(localStorage.getItem('dc_ai_profile') || '');
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setIsFetchingProfile(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('cv_content')
        .eq('id', user.id)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // PGRST116 is "no rows found"
          console.error('Error fetching profile:', error);
        }
      } else if (data?.cv_content) {
        setProfile(data.cv_content);
        localStorage.setItem('dc_ai_profile', data.cv_content);
      }
    } catch (e) {
      console.error('Error in fetchProfile:', e);
    } finally {
      setIsFetchingProfile(false);
    }
  };

  const saveProfileToSupabase = async (content: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          cv_content: content,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (e) {
      console.error('Error saving profile to Supabase:', e);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LINKEDIN_AUTH_SUCCESS') {
        setIsConnected(true);
        if (event.data.isLogin && event.data.user) {
          setIsLinkedInUser(true);
          setUser({
            id: event.data.user.sub,
            email: event.data.user.email,
            user_metadata: {
              full_name: event.data.user.name,
              avatar_url: event.data.user.picture
            }
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkConnection = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/auth/linkedin/status?userId=${user.id}`);
      const data = await res.json();
      setIsConnected(data.connected);
    } catch (e: any) {
      console.error('checkConnection error:', e);
      if (e.message === 'Failed to fetch') {
        console.warn('Network error detected in checkConnection. This might be a port mismatch or server down.');
      }
    }
  };

  const handleImportCV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setSettingsMessage({ type: '', text: '' });

    try {
      let text = '';
      const fileType = file.name.split('.').pop()?.toLowerCase();

      if (fileType === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          fullText += strings.join(' ') + '\n';
        }
        text = fullText;
      } else if (fileType === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (fileType === 'doc') {
        throw new Error('El formato .doc antiguo no es compatible. Por favor usa .docx o .pdf');
      } else {
        throw new Error('Formato de archivo no compatible. Usa PDF o Word (.docx)');
      }

      if (text.trim()) {
        setProfile(text.trim());
        localStorage.setItem('dc_ai_profile', text.trim());
        if (user) {
          await saveProfileToSupabase(text.trim());
        }
        setSettingsMessage({ type: 'success', text: 'CV importado correctamente' });
      } else {
        throw new Error('No se pudo extraer texto del archivo');
      }
    } catch (e: any) {
      setSettingsMessage({ type: 'error', text: e.message || 'Error al importar el archivo' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSummarizeCV = async () => {
    if (!profile.trim()) return;

    setIsSummarizing(true);
    try {
      const summary = await summarizeCV(profile);
      if (summary) {
        setProfile(summary);
        localStorage.setItem('dc_ai_profile', summary);
        if (user) {
          await saveProfileToSupabase(summary);
        }
      }
    } catch (e) {
      console.error("Error summarizing CV:", e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    // Password Policy Check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(loginPassword)) {
      setAuthError('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.');
      return;
    }

    setIsAuthLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: loginEmail,
          password: loginPassword,
        });
        if (error) throw error;
        alert('¡Registro exitoso! Por favor, revisa tu correo para confirmar tu cuenta (si la confirmación está habilitada en Supabase).');
        setAuthMode('login');
      }
    } catch (e: any) {
      setAuthError(e.message || 'Error en la autenticación');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLinkedInUser(false);
    setUser(null);
    setProfile('');
    setLoginPassword('');
    setIsSettingsOpen(false);
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setSettingsMessage({ type: '', text: '' });

    try {
      // Update Password if provided
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error('Las contraseñas no coinciden');
        }
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
          throw new Error('La nueva contraseña no cumple con las políticas de seguridad');
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      }

      // Update Profile (CV) in Supabase
      localStorage.setItem('dc_ai_profile', profile);
      if (user) {
        await saveProfileToSupabase(profile);
      }

      setSettingsMessage({ type: 'success', text: 'Perfil actualizado con éxito' });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setIsSettingsOpen(false), 2000);
    } catch (e: any) {
      setSettingsMessage({ type: 'error', text: e.message || 'Error al actualizar' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleConnect = async (isLogin = false) => {
    try {
      const userIdParam = user ? `&userId=${user.id}` : '';
      const endpoint = `/api/auth/linkedin/url?login=${isLogin}${userIdParam}`;
      console.log('Fetching LinkedIn Auth URL from:', endpoint);

      const res = await fetch(endpoint);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
      }

      const { url } = await res.json();
      console.log('LinkedIn Auth URL received:', url);
      window.open(url, 'linkedin_oauth', 'width=600,height=600');
    } catch (e: any) {
      console.error('handleConnect error:', e);
      alert(`Error al conectar con LinkedIn: ${e.message}. \n\nEsto suele pasar si el servidor no está corriendo en el mismo puerto que la web o si hay un error en el servidor.`);
    }
  };

  const handlePostToLinkedIn = async () => {
    if (!post) return;
    setIsPosting(true);
    const fullText = `${post.hook}\n\n${post.body}\n\n${post.cta}\n\n${post.hashtags.join(' ')}`;

    try {
      const res = await fetch('/api/linkedin/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullText,
          userId: user.id,
          imageUrl: selectedImage
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('¡Post publicado con éxito en LinkedIn!');
      } else {
        throw new Error(data.error?.message || 'Error desconocido');
      }
    } catch (e: any) {
      alert(`Error al publicar: ${e.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  const handleGenerate = async () => {
    if (!topic) return;
    setIsGenerating(true);
    setSelectedImage(null);
    try {
      const result = await generateLinkedInContent(profile || 'Experto en Infraestructura de Datos e IA', topic, tone);
      setPost(result);
    } catch (error: any) {
      console.error(error);
      alert(`Error al generar el contenido: ${error.message || 'Por favor, inténtalo de nuevo.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestImage = async () => {
    if (!post || !post.imageKeywords) return;
    setIsGeneratingImage(true);
    try {
      const proxyUrl = `/api/image/search?q=${encodeURIComponent(post.imageKeywords)}`;
      const imgRes = await fetch(proxyUrl);
      if (imgRes.ok) {
        const imgData = await imgRes.json();
        if (imgData.url) {
          setSelectedImage(imgData.url);
        }
      }
    } catch (e) {
      console.error("Error fetching image through proxy:", e);
      setSelectedImage(`https://images.unsplash.com/photo-1558494949-ef010cbdcc48?q=80&w=1200&auto=format&fit=crop`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleClear = () => {
    setTopic('');
    setPost(null);
  };

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const copyFullPost = () => {
    if (!post) return;
    const fullText = `${post.hook}\n\n${post.body}\n\n${post.cta}\n\n${post.hashtags.join(' ')}`;
    copyToClipboard(fullText, 'full');
  };

  const exampleTopics = [
    "Impacto de GPUs Blackwell en el diseño de racks",
    "Estrategias de enfriamiento líquido para clusters de IA",
    "Sostenibilidad y eficiencia energética en la era de la IA",
    "Edge Computing vs Core Data Centers para inferencia"
  ];

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#F4F2EE] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#0A66C2] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F4F2EE] flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
        >
          <div className="bg-[#0A66C2] p-8 flex flex-col items-center text-white">
            <div className="bg-white/20 p-4 rounded-2xl mb-4 backdrop-blur-sm">
              <Database className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-center">DataCenter AI Creator</h1>
            <p className="text-white/80 text-sm mt-2 text-center">
              {authMode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta gratuita'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="p-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Correo Electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none"
                    placeholder="ejemplo@correo.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {authError && (
              <p className="text-xs text-red-500 bg-red-50 p-3 rounded-lg border border-red-100">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-4 bg-[#0A66C2] text-white rounded-xl font-bold hover:bg-[#004182] transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#0A66C2]/20 active:scale-[0.98]"
            >
              {isAuthLoading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                authMode === 'login' ? "Iniciar Sesión" : "Registrarse"
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-xs text-[#0A66C2] font-bold hover:underline"
              >
                {authMode === 'login' ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
              </button>
            </div>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500 font-bold">O también</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleConnect(true)}
              className="w-full py-3 border-2 border-[#0A66C2] text-[#0A66C2] rounded-xl font-bold hover:bg-[#0A66C2]/5 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Database className="w-5 h-5" />
              Continuar con LinkedIn
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F2EE] text-[#1D1D1D] font-sans selection:bg-[#0A66C2]/20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#0A66C2] p-1.5 rounded">
              <Database className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">DataCenter <span className="text-[#0A66C2]">AI</span> Creator</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full border border-gray-200">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-gray-300"
              )} />
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
                {isConnected ? 'LinkedIn Conectado' : 'LinkedIn Desconectado'}
              </span>
            </div>
            <div className="flex items-center gap-1 border-l border-gray-200 pl-4">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-gray-400 hover:text-[#0A66C2] transition-colors"
                title="Configuración de Perfil"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="bg-[#0A66C2] p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings className="w-6 h-6" />
                  <h2 className="text-xl font-bold">Configuración de Perfil</h2>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateSettings} className="p-8 space-y-8">
                {/* CV Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#0A66C2]">
                      <FileText className="w-5 h-5" />
                      <h3 className="font-bold uppercase text-xs tracking-widest">Tu CV Profesional</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportCV}
                        accept=".pdf,.docx"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-100 transition-all disabled:opacity-50"
                      >
                        {isImporting ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        Importar PDF/Word
                      </button>
                      <button
                        type="button"
                        onClick={handleSummarizeCV}
                        disabled={isSummarizing || !profile.trim()}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-[10px] font-bold uppercase tracking-wider text-[#0A66C2] hover:bg-blue-100 transition-all disabled:opacity-50"
                      >
                        {isSummarizing ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Resumir con IA
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 relative">
                    {isFetchingProfile && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-xl">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-5 h-5 text-[#0A66C2] animate-spin" />
                          <span className="text-[10px] font-bold text-[#0A66C2] uppercase tracking-widest">Cargando CV...</span>
                        </div>
                      </div>
                    )}
                    <textarea
                      value={profile}
                      onChange={(e) => setProfile(e.target.value)}
                      placeholder="Actualiza tu resumen profesional aquí..."
                      className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none resize-none"
                    />
                    <p className="text-[10px] text-gray-400 italic">Este resumen se guarda de forma segura en tu perfil y se utiliza para personalizar tus posts.</p>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Password Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[#0A66C2]">
                    <Lock className="w-5 h-5" />
                    <h3 className="font-bold uppercase text-xs tracking-widest">Cambiar Contraseña</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Nueva Contraseña</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Confirmar</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                {settingsMessage.text && (
                  <div className={cn(
                    "p-4 rounded-xl text-xs font-medium border",
                    settingsMessage.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
                  )}>
                    {settingsMessage.text}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex-1 py-3 bg-[#0A66C2] text-white rounded-xl font-bold hover:bg-[#004182] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#0A66C2]/20"
                  >
                    {isUpdatingProfile ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Guardar Cambios"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Inputs */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#0A66C2]" />
                <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-600">Tu Perfil Profesional</h2>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Vinculado
                  </span>
                  <button
                    onClick={() => handleConnect(false)}
                    className="text-[10px] text-gray-400 hover:text-[#0A66C2] font-bold"
                  >
                    Re-vincular
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleConnect(false)}
                  className="text-[10px] bg-[#0A66C2] text-white px-2 py-1 rounded font-bold hover:bg-[#004182] transition-colors flex items-center gap-1"
                >
                  <Database className="w-3 h-3" /> Conectar LinkedIn
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase">Resumen de CV / Bio</label>
                  <button
                    onClick={handleSummarizeCV}
                    disabled={isSummarizing || !profile.trim()}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#0A66C2] hover:text-[#004182] disabled:opacity-50 transition-colors"
                  >
                    {isSummarizing ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Resumir con IA
                  </button>
                </div>
                <div className="relative">
                  {isFetchingProfile && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-lg">
                      <RefreshCw className="w-4 h-4 text-[#0A66C2] animate-spin" />
                    </div>
                  )}
                  <textarea
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    placeholder="Pega aquí tu experiencia relevante en centros de datos e IA..."
                    className="w-full h-32 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] focus:border-transparent transition-all outline-none resize-none"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-2 italic">Se guarda de forma segura en tu perfil profesional.</p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0A66C2]" />
              <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-600">Configuración del Post</h2>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tema o Idea Central</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ej: El impacto del enfriamiento líquido en clusters de IA"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {exampleTopics.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTopic(t)}
                      className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tono de Voz</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A66C2] outline-none appearance-none cursor-pointer"
                >
                  <option>Profesional y Técnico</option>
                  <option>Visionario y Estratégico</option>
                  <option>Educativo y Divulgativo</option>
                  <option>Opinión y Liderazgo</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleClear}
                  className="px-4 py-3 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-200 transition-all"
                >
                  Limpiar
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic}
                  className={cn(
                    "flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all",
                    isGenerating || !topic
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-[#0A66C2] text-white hover:bg-[#004182] shadow-lg shadow-[#0A66C2]/20 active:scale-[0.98]"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Generar Post
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Vista Previa</h2>
          </div>

          <AnimatePresence mode="wait">
            {!post && !isGenerating ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white/50 border-2 border-dashed border-gray-300 rounded-2xl"
              >
                <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                  <Layout className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">Tu contenido aparecerá aquí</h3>
                <p className="text-sm text-gray-400 max-w-xs mt-2">
                  Define tu perfil y el tema para empezar a crear contenido de alto impacto.
                </p>
              </motion.div>
            ) : isGenerating ? (
              <motion.div key="loading" className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-1/4 mb-4"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-50 rounded w-full"></div>
                      <div className="h-3 bg-gray-50 rounded w-5/6"></div>
                      <div className="h-3 bg-gray-50 rounded w-4/6"></div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-[550px] mx-auto">
                  <div className="p-4 flex items-start gap-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0 flex items-center justify-center">
                      <User className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-sm hover:text-[#0A66C2] hover:underline cursor-pointer">Tu Nombre</span>
                        <span className="text-xs text-gray-500">• 1º</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-tight">Experto en Centros de Datos e IA</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">Ahora • <Database className="w-2.5 h-2.5" /></p>
                    </div>
                  </div>

                  {selectedImage && (
                    <div className="relative group aspect-video overflow-hidden border-y border-gray-100 bg-gray-50">
                      <img
                        src={selectedImage}
                        alt="Post visual"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc48?q=80&w=1200&auto=format&fit=crop';
                        }}
                      />
                      <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                        title="Quitar imagen"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="px-4 pb-4 space-y-4 text-sm text-gray-800 pt-4">
                    <p className="font-bold">{post?.hook || ''}</p>
                    <p className="whitespace-pre-wrap">{post?.body || ''}</p>
                    <p className="font-medium text-[#0A66C2]">{post?.cta || ''}</p>
                    <p className="text-[#0A66C2] font-medium">{(post?.hashtags || []).join(' ')}</p>
                  </div>
                  <div className="border-t border-gray-100 p-2 flex items-center justify-around text-gray-500 font-semibold text-sm">
                    <button className="flex items-center gap-2 hover:bg-gray-100 p-2 rounded-lg transition-colors flex-1 justify-center">
                      <Sparkles className="w-4 h-4" /> Recomendar
                    </button>
                    <button className="flex items-center gap-2 hover:bg-gray-100 p-2 rounded-lg transition-colors flex-1 justify-center">
                      <FileText className="w-4 h-4" /> Comentar
                    </button>
                    <button className="flex items-center gap-2 hover:bg-gray-100 p-2 rounded-lg transition-colors flex-1 justify-center">
                      <Send className="w-4 h-4" /> Compartir
                    </button>
                  </div>
                </div>

                <div className="max-w-[550px] mx-auto grid grid-cols-2 gap-3">
                  <button
                    onClick={copyFullPost}
                    className="py-3 bg-white border-2 border-[#0A66C2] text-[#0A66C2] rounded-xl font-bold hover:bg-[#0A66C2]/5 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    {copiedSection === 'full' ? (
                      <><Check className="w-4 h-4" /> Copiado</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copiar Texto</>
                    )}
                  </button>

                  <button
                    onClick={handleSuggestImage}
                    disabled={isGeneratingImage || !post}
                    className="py-3 bg-white border-2 border-emerald-600 text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isGeneratingImage ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Generando...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> {selectedImage ? 'Cambiar Imagen' : 'Generar Imagen'}</>
                    )}
                  </button>
                </div>

                <div className="max-w-[550px] mx-auto space-y-4">
                  <button
                    onClick={copyFullPost}
                    className="w-full py-4 bg-white border-2 border-[#0A66C2] text-[#0A66C2] rounded-xl font-bold hover:bg-[#0A66C2]/5 transition-all flex items-center justify-center gap-2"
                  >
                    {copiedSection === 'full' ? (
                      <><Check className="w-5 h-5" /> Copiado al portapapeles</>
                    ) : (
                      <><Copy className="w-5 h-5" /> Copiar Post Completo</>
                    )}
                  </button>

                  <div className="pt-2">
                    {!isConnected ? (
                      <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex flex-col items-center gap-3">
                        <p className="text-xs text-amber-700 text-center font-medium">
                          Conecta tu cuenta de LinkedIn en la sección de perfil para habilitar la publicación directa.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handlePostToLinkedIn}
                        disabled={isPosting}
                        className={cn(
                          "w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                          isPosting
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                            : "bg-[#0A66C2] text-white hover:bg-[#004182] shadow-[#0A66C2]/20"
                        )}
                      >
                        {isPosting ? (
                          <><RefreshCw className="w-5 h-5 animate-spin" /> Publicando...</>
                        ) : (
                          <><Send className="w-5 h-5" /> Publicar ahora en LinkedIn</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}


