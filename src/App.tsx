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
  LogOut,
  Settings,
  X,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateLinkedInContent, LinkedInPost, summarizeCV, generateImagePromptFromScript, validateImageRelevance, refineImagePrompt } from './services/geminiService';
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
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('dc_linkedin_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLinkedInUser, setIsLinkedInUser] = useState(() => !!localStorage.getItem('dc_linkedin_user'));
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
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Supabase getSession error:', error.message);
      }
      if (session?.user) {
        setUser(session.user);
      }
      setIsCheckingAuth(false);
    }).catch(err => {
      console.error('Supabase getSession critical error:', err);
      setIsCheckingAuth(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const isActuallyLinkedInUser = !!localStorage.getItem('dc_linkedin_user');
      if (!isActuallyLinkedInUser) {
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
          const linkedinUser = {
            id: event.data.user.sub,
            email: event.data.user.email,
            user_metadata: {
              full_name: event.data.user.name,
              avatar_url: event.data.user.picture
            }
          };
          setUser(linkedinUser);
          localStorage.setItem('dc_linkedin_user', JSON.stringify(linkedinUser));
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


  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('dc_linkedin_user');
    setIsLinkedInUser(false);
    setUser(null);
    setProfile('');
    setIsSettingsOpen(false);
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setSettingsMessage({ type: '', text: '' });

    try {
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
    const fullText = `${post.hook}\n\n\n${post.body}\n\n\n${post.cta}\n\n\n${post.hashtags.join(' ')}`;

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
    setSimilarityScore(null);
    
    try {
      let currentPrompt = await generateImagePromptFromScript(post.imageKeywords || topic);
      let bestImage = null;
      let bestScore = 0;
      let attempts = 0;
      const MAX_ATTEMPTS = 2;

      while (attempts < MAX_ATTEMPTS) {
        console.log(`Attempt ${attempts + 1}: Generating image with prompt: ${currentPrompt}`);
        const proxyUrl = `/api/image/search?q=${encodeURIComponent(currentPrompt)}`;
        const imgRes = await fetch(proxyUrl);
        
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          if (imgData.url) {
            const score = await validateImageRelevance(post.body || topic, imgData.url);
            
            if (score > bestScore) {
              bestScore = score;
              bestImage = imgData.url;
            }

            if (score >= 0.7) { // Good enough
              break;
            }

            // If not good enough, refine prompt for next attempt
            currentPrompt = await refineImagePrompt(currentPrompt, post.body, score);
          }
        }
        attempts++;
      }

      if (bestImage) {
        setSelectedImage(bestImage);
        setSimilarityScore(bestScore);
      }
    } catch (e) {
      console.error("Error in handleSuggestImage:", e);
      setSelectedImage(`https://images.unsplash.com/photo-1558494949-ef010cbdcc48?q=80&w=1200&auto=format&fit=crop`);
      setSimilarityScore(null);
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
    const fullText = `${post.hook}\n\n\n${post.body}\n\n\n${post.cta}\n\n\n${post.hashtags.join(' ')}`;
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden"
        >
          <div className="bg-gradient-to-br from-[#0A66C2] to-[#004182] p-10 flex flex-col items-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
            <div className="bg-white/15 p-5 rounded-3xl mb-6 backdrop-blur-md shadow-inner border border-white/20">
              <Database className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-center tracking-tight">Linkpost AI</h1>
            <p className="text-white/80 text-sm mt-3 text-center font-medium">
              Eleva tu marca personal en LinkedIn con IA
            </p>
          </div>

          <div className="p-6 md:p-10 space-y-6 md:space-y-8">
            <div className="text-center space-y-3">
              <h3 className="text-slate-800 font-bold text-lg">Bienvenido de nuevo</h3>
              <p className="text-slate-500 text-sm">
                Conéctate para generar contenido estratégico para el sector de Infraestructura Data Center.
              </p>
            </div>

            <button
              type="button"
              disabled={isAuthLoading}
              onClick={() => handleConnect(true)}
              className="w-full py-4 bg-[#0A66C2] text-white rounded-2xl font-bold hover:bg-[#004182] transition-all flex items-center justify-center gap-3 shadow-xl shadow-[#0A66C2]/20 active:scale-[0.98] disabled:opacity-50"
            >
              {isAuthLoading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Database className="w-5 h-5" />
                  Continuar con LinkedIn
                </>
              )}
            </button>

            <div className="grid grid-cols-3 items-center gap-4">
              <div className="h-px bg-slate-100"></div>
              <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">Seguro & Privado</p>
              <div className="h-px bg-slate-100"></div>
            </div>

            <p className="text-[11px] text-center text-slate-400 leading-relaxed px-4">
              Protegemos tus datos. Al continuar, permites el acceso a tu perfil básico para personalización.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-[#0A66C2]/10 leading-relaxed">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#0A66C2] p-2 rounded-xl shadow-lg shadow-[#0A66C2]/20">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl tracking-tight text-slate-900">Linkpost <span className="text-[#0A66C2]">AI</span></h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider -mt-1">Professional Creator</p>
            </div>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-200">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300"
              )} />
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500">
                {isConnected ? 'LinkedIn Sync' : 'LinkedIn Link'}
              </span>
            </div>
            <div className="flex items-center gap-1 md:gap-2 border-l border-slate-200 pl-3 md:pl-6">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 text-slate-400 hover:text-[#0A66C2] hover:bg-slate-50 rounded-xl transition-all"
                title="Ajustes"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
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

              <form onSubmit={handleUpdateSettings} className="p-5 md:p-8 space-y-6 md:space-y-8 max-h-[80vh] overflow-y-auto">
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


                {settingsMessage.text && (
                  <div className={cn(
                    "p-4 rounded-xl text-xs font-medium border",
                    settingsMessage.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
                  )}>
                    {settingsMessage.text}
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 md:pt-4">
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

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-5 space-y-6 md:space-y-8">
          <section className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-slate-200 p-2 rounded-lg">
                  <User className="w-4 h-4 text-[#0A66C2]" />
                </div>
                <h2 className="font-bold text-xs uppercase tracking-[0.15em] text-slate-500">Perfil Profesional</h2>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 border border-emerald-100">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Activo
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => handleConnect(false)}
                  className="text-[10px] bg-[#0A66C2] text-white px-3 py-1.5 rounded-full font-bold hover:bg-[#004182] transition-all flex items-center gap-2 shadow-lg shadow-[#0A66C2]/10"
                >
                  <Database className="w-3 h-3" /> Asociar
                </button>
              )}
            </div>
            <div className="p-5 md:p-7 space-y-5 md:space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Resumen Ejecutivo / CV</label>
                  <button
                    onClick={handleSummarizeCV}
                    disabled={isSummarizing || !profile.trim()}
                    className="flex items-center gap-2 text-[11px] font-bold text-[#0A66C2] hover:text-[#004182] disabled:opacity-30 transition-all px-2 py-1 hover:bg-slate-50 rounded-lg"
                  >
                    {isSummarizing ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Optimizar IA
                  </button>
                </div>
                <div className="relative group">
                  {isFetchingProfile && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-[#0A66C2] animate-spin" />
                      </div>
                    </div>
                  )}
                  <textarea
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    placeholder="Describe tu trayectoria técnica..."
                    className="w-full h-40 p-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-[#0A66C2]/5 focus:border-[#0A66C2] transition-all outline-none resize-none leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-white/80 backdrop-blur rounded-md px-2 py-1 border border-slate-200 text-[10px] font-bold text-slate-400 uppercase">Editable</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="bg-slate-200 p-2 rounded-lg">
                <Sparkles className="w-4 h-4 text-[#0A66C2]" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-[0.15em] text-slate-500">Configuración del Post</h2>
            </div>
            <div className="p-5 md:p-7 space-y-5 md:space-y-7">
              <div>
                <div className="relative">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Ej: Innovación en sostenibilidad para Data Centers"
                    maxLength={100}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-[#0A66C2]/5 outline-none pr-16"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                    {topic.length}/100
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {exampleTopics.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTopic(t)}
                      className="text-[10px] bg-slate-100 hover:bg-[#0A66C2] hover:text-white text-slate-500 px-3 py-1.5 rounded-full font-bold transition-all border border-slate-200 hover:border-[#0A66C2]"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Enfoque Narrativo</label>
                <div className="relative">
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm appearance-none cursor-pointer focus:ring-4 focus:ring-[#0A66C2]/5 outline-none"
                  >
                    <option>Profesional y Técnico</option>
                    <option>Visionario y Estratégico</option>
                    <option>Educativo y Divulgativo</option>
                    <option>Opinión y Liderazgo</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ChevronRight className="w-4 h-4 rotate-90" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-2 md:pt-4">
                <button
                  onClick={handleClear}
                  className="px-4 md:px-6 py-3 md:py-4 bg-slate-50 text-slate-500 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all border border-slate-200"
                >
                  Reset
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic}
                  className={cn(
                    "flex-1 py-3 md:py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-xl active:scale-[0.98]",
                    isGenerating || !topic
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                      : "bg-[#0A66C2] text-white hover:bg-[#004182] shadow-[#0A66C2]/20 shadow-lg"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Generar Post
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-7 space-y-8">
          <div className="flex items-center justify-between mb-2 px-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
              <h2 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-[0.2em]">LinkedIn Studio</h2>
            </div>
            <div className="text-[10px] font-bold text-slate-300 italic">Viste Previa en Tiempo Real</div>
          </div>

          <AnimatePresence mode="wait">
            {!post && !isGenerating ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 shadow-inner"
              >
                <div className="bg-slate-50 p-8 rounded-full mb-6 border border-slate-100 shadow-sm">
                  <Layout className="w-12 h-12 text-slate-200" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Crea algo extraordinario</h3>
                <p className="text-sm text-slate-400 max-w-sm mt-3 leading-relaxed">
                  Completa los campos de la izquierda y deja que nuestra IA especializada en Infraestructura genere un post de alto impacto para ti.
                </p>
              </motion.div>
            ) : isGenerating ? (
              <motion.div key="loading" className="space-y-8">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-3xl p-8 border border-slate-100 animate-pulse shadow-sm">
                    <div className="flex gap-4 mb-6">
                      <div className="w-12 h-12 bg-slate-100 rounded-full"></div>
                      <div className="space-y-2 flex-1 pt-2">
                        <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                        <div className="h-2 bg-slate-50 rounded w-1/4"></div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 bg-slate-100 rounded w-full"></div>
                      <div className="h-3 bg-slate-100 rounded w-11/12"></div>
                      <div className="h-3 bg-slate-100 rounded w-4/5"></div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.98, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-8"
              >
                <div className="bg-white rounded-[1.5rem] border border-slate-200 shadow-xl overflow-hidden max-w-[550px] mx-auto transition-transform hover:scale-[1.01] duration-300">
                  <div className="p-5 flex items-start gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex-shrink-0 flex items-center justify-center border border-slate-200 overflow-hidden shadow-inner">
                      {user?.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-slate-900 leading-tight">{user?.user_metadata?.full_name || 'Tu Nombre'}</span>
                        <span className="text-[10px] text-slate-400 font-bold tracking-widest">• 1º</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">Estratega en Infraestructura de Datos e IA</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 flex items-center gap-1.5">
                        Ahora • <Database className="w-3 h-3 text-[#0A66C2]" /> AI Optimized
                      </p>
                    </div>
                  </div>

                  {selectedImage && (
                    <div className="relative group aspect-video overflow-hidden bg-slate-100 border-y border-slate-100">
                      <img
                        src={selectedImage}
                        alt="Post visual"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (!target.src.includes('unsplash')) {
                            target.src = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc48?q=80&w=1200&auto=format&fit=crop';
                          }
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      {/* AI Verification Badge */}
                      {similarityScore !== null && (
                        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm z-10">
                          <Check className={cn(
                            "w-3 h-3",
                            similarityScore > 0.65 ? "text-emerald-500" : "text-amber-500"
                          )} />
                          <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wider">
                            {similarityScore > 0.65 ? 'IA Verificada' : 'IA Analizada'} 
                            <span className="ml-1 opacity-50">{(similarityScore * 100).toFixed(0)}%</span>
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur text-slate-900 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-white shadow-lg active:scale-90"
                        title="Quitar imagen"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="px-6 pb-6 space-y-6 text-[14px] text-slate-700 pt-6 leading-relaxed font-medium">
                    <p className="text-slate-900 font-extrabold text-base leading-snug">{post?.hook || ''}</p>
                    <p className="whitespace-pre-wrap">{post?.body || ''}</p>
                    <p className="font-extrabold text-[#0A66C2] bg-[#0A66C2]/5 px-3 py-2 rounded-lg inline-block">{post?.cta || ''}</p>
                    <p className="text-[#0A66C2] font-bold text-xs tracking-wide">{(post?.hashtags || []).join(' ')}</p>
                  </div>

                  <div className="border-t border-slate-100 p-3 flex items-center justify-around bg-slate-50/30">
                    <div className="flex-1 flex justify-center py-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group">
                      <Sparkles className="w-4 h-4 text-slate-400 group-hover:text-[#0A66C2]" />
                    </div>
                    <div className="flex-1 flex justify-center py-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group">
                      <FileText className="w-4 h-4 text-slate-400 group-hover:text-[#0A66C2]" />
                    </div>
                    <div className="flex-1 flex justify-center py-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group">
                      <Send className="w-4 h-4 text-slate-400 group-hover:text-[#0A66C2]" />
                    </div>
                  </div>
                </div>

                <div className="max-w-[550px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <button
                    onClick={copyFullPost}
                    className="py-3 md:py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-3 text-sm shadow-sm"
                  >
                    {copiedSection === 'full' ? (
                      <><Check className="w-4 h-4 text-emerald-500" /> Copiado</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copiar Texto</>
                    )}
                  </button>

                  <button
                    onClick={handleSuggestImage}
                    disabled={isGeneratingImage || !post}
                    className="py-3 md:py-4 bg-[#0A66C2] text-white rounded-2xl font-bold hover:bg-[#004182] transition-all flex items-center justify-center gap-3 text-sm shadow-lg shadow-[#0A66C2]/20 disabled:opacity-50"
                  >
                    {isGeneratingImage ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Generando...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> {selectedImage ? 'Nueva Imagen' : 'Analizar Imagen'}</>
                    )}
                  </button>
                </div>

                <div className="max-w-[550px] mx-auto pt-4">
                  {!isConnected ? (
                    <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
                      <p className="text-[11px] text-amber-700 text-center font-bold uppercase tracking-widest">
                        Acción Requerida
                      </p>
                      <button
                        onClick={() => handleConnect(false)}
                        className="text-xs bg-amber-600 text-white px-5 py-2.5 rounded-full font-bold hover:bg-amber-700 transition-all shadow-md"
                      >
                        Conectar con LinkedIn
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handlePostToLinkedIn}
                      disabled={isPosting}
                      className={cn(
                        "w-full py-5 rounded-[2rem] font-bold transition-all flex items-center justify-center gap-4 shadow-2xl active:scale-[0.98] group relative overflow-hidden",
                        isPosting
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                          : "bg-gradient-to-r from-[#0A66C2] to-[#004182] text-white"
                      )}
                    >
                      <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                      {isPosting ? (
                        <><RefreshCw className="w-5 h-5 animate-spin" /> Publicando...</>
                      ) : (
                        <><Send className="w-5 h-5" /> Publicar en LinkedIn</>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
