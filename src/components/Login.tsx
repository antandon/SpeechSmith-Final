
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Lock, Mail, UserPlus, Mic, ArrowLeft, MailCheck, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTrialMode } from '@/hooks/useTrialMode';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const Login: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { isTrialExpired, getRemainingTries } = useTrialMode();
  
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  const [signupData, setSignupData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('login');
  // Email a confirmation link was just sent to - swaps the sign-up form for a
  // "check your inbox" screen, since the account can't be used until confirmed.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const resendConfirmation = async (email: string) => {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/` } });
    setResending(false);
    if (error) toast.error(error.message || 'Could not resend the email. Please try again shortly.');
    else toast.success(`Confirmation email sent to ${email}`);
  };

  const backToLogin = (email: string) => {
    setPendingEmail(null);
    setLoginData({ email, password: '' });
    setTab('login');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(loginData.email, loginData.password);
      
      if (error) {
        console.error('Login error:', error);
        
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Invalid email or password. Please check your credentials.');
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Please confirm your email first', {
            description: `Open the confirmation link we emailed to ${loginData.email} (check spam too), then sign in.`,
            action: { label: 'Resend email', onClick: () => resendConfirmation(loginData.email) },
            duration: 10000,
          });
        } else {
          toast.error(error.message || 'Failed to sign in. Please try again.');
        }
        return;
      }

      toast.success('Successfully logged in!');
      navigate('/');
    } catch (error) {
      console.error('Unexpected login error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupData.password !== signupData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (signupData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      const { error, needsConfirmation, alreadyRegistered } = await signUp(signupData.email, signupData.password, signupData.fullName);
      
      if (error) {
        console.error('Signup error:', error);
        
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          toast.error('An account with this email already exists. Please try logging in instead.');
        } else {
          toast.error(error.message || 'Failed to create account. Please try again.');
        }
        return;
      }

      if (alreadyRegistered) {
        toast.error('An account with this email already exists. Please log in instead.');
        backToLogin(signupData.email);
        return;
      }

      if (needsConfirmation) {
        setPendingEmail(signupData.email);
        setSignupData({ fullName: '', email: '', password: '', confirmPassword: '' });
        return;
      }

      toast.success('Account created successfully! Welcome to SpeechSmith!');
      navigate('/');
    } catch (error) {
      console.error('Unexpected signup error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleTryForFree = () => {
    if (isTrialExpired) {
      toast.error('Your free trial has expired! Please sign up to continue using SpeechSmith.');
      return;
    }
    
    const remainingTries = getRemainingTries();
    if (remainingTries > 0) {
      toast.success(`Welcome! You have ${remainingTries} free tries remaining.`);
      navigate('/');
    } else {
      toast.error('Your free trial has expired! Please sign up to continue using SpeechSmith.');
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <Mic className="h-12 w-12 text-primary" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Welcome to SpeechSmith
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            AI-powered speech analysis and improvement
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Get Started</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Try for Free Button */}
            <div className="mb-6">
              <Button 
                onClick={handleTryForFree}
                variant="outline"
                className="w-full border-2 border-secondary/20 hover:bg-accent/50"
                disabled={isTrialExpired}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {isTrialExpired ? 'Trial Expired - Sign Up Required' : `Try Free (${getRemainingTries()} tries remaining)`}
              </Button>
              <p className="text-xs text-gray-500 text-center mt-2">
                No registration required • Limited features
              </p>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Or create an account</span>
              </div>
            </div>

            {pendingEmail ? (
              <div className="text-center space-y-4 py-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <MailCheck className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-gray-900">Confirm your email</h3>
                  <p className="text-sm text-gray-600">
                    We sent a confirmation link to <span className="font-medium text-gray-900 break-all">{pendingEmail}</span>.
                  </p>
                </div>
                <ol className="text-left text-sm text-gray-700 space-y-1.5 rounded-lg border bg-gray-50 p-4 list-decimal list-inside">
                  <li>Open the confirmation email in your inbox (check Spam or Promotions too).</li>
                  <li>Click the link in it to activate your account.</li>
                  <li>Come back here and log in with your email and password.</li>
                </ol>
                <div className="flex flex-col gap-2">
                  <Button className="w-full" onClick={() => backToLogin(pendingEmail)}>
                    I've confirmed - go to login
                  </Button>
                  <Button variant="ghost" className="w-full" disabled={resending} onClick={() => resendConfirmation(pendingEmail)}>
                    {resending ? 'Sending...' : "Didn't get it? Resend email"}
                  </Button>
                </div>
              </div>
            ) : (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="Enter your email"
                        className="pl-10"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Enter your password"
                        className="pl-10"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                    <User className="mr-2 h-4 w-4" />
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <Alert className="border-secondary/20 bg-accent/50 text-stone-900">
                    <Info className="h-4 w-4 !text-stone-700" />
                    <AlertDescription>
                      After signing up, you'll get an email with a confirmation link. You need to click it before you can log in.
                    </AlertDescription>
                  </Alert>

                  <div>
                    <Label htmlFor="signup-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Enter your full name"
                        className="pl-10"
                        value={signupData.fullName}
                        onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="Enter your email"
                        className="pl-10"
                        value={signupData.email}
                        onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Create a password (min 6 characters)"
                        className="pl-10"
                        value={signupData.password}
                        onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="signup-confirm-password"
                        type="password"
                        placeholder="Confirm your password"
                        className="pl-10"
                        value={signupData.confirmPassword}
                        onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full bg-secondary hover:bg-secondary/90">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
