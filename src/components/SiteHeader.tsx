
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  NavigationMenu, 
  NavigationMenuContent, 
  NavigationMenuItem, 
  NavigationMenuLink, 
  NavigationMenuList, 
  NavigationMenuTrigger,
  navigationMenuTriggerStyle
} from '@/components/ui/navigation-menu';
import { Button } from '@/components/ui/button';
import { Mic, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import UserProfile from './UserProfile';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const SiteHeader: React.FC = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [userName, setUserName] = useState<string>('Profile');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const fetchUserName = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        if (!error && data?.full_name) {
          setUserName(data.full_name);
        } else {
          setUserName(user.email?.split('@')[0] || 'Profile');
        }
      }
    };

    fetchUserName();
  }, [user]);

  const isActivePath = (path: string) => {
    return location.pathname === path;
  };

  // Desktop links: no background, the current page gets a gold underline.
  const navLink = (path: string) => cn(
    navigationMenuTriggerStyle(),
    'bg-transparent hover:bg-transparent focus:bg-transparent hover:text-secondary focus:text-foreground',
    isActivePath(path) && 'underline decoration-secondary decoration-2 underline-offset-[12px]'
  );

  return (
    <header className="px-4 pt-4">
      <div className="container mx-auto rounded-2xl border bg-background px-4 py-2 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0 space-x-2">
            <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-lg font-bold text-gray-900">SpeechSmith</span>
          </Link>

          {/* Navigation */}
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  asChild
                  className={navLink('/')}
                >
                  <Link to="/">Dashboard</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink
                  asChild
                  className={navLink('/practice')}
                >
                  <Link to="/practice">Practice</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuLink
                  asChild
                  className={navLink('/about')}
                >
                  <Link to="/about">About</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          {/* User Menu */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {user ? (
              <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center space-x-2" aria-label={`Profile: ${userName}`}>
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{userName}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <UserProfile onSaved={(name) => { setUserName(name); setProfileOpen(false); }} />
                </DialogContent>
              </Dialog>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/auth" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button variant="default" size="sm">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Menu</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid gap-3 p-4 w-48">
                      <NavigationMenuLink asChild>
                        <Link
                          to="/"
                          className={`block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${
                            isActivePath('/') ? 'bg-accent text-accent-foreground' : ''
                          }`}
                        >
                          Dashboard
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link
                          to="/practice"
                          className={`block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${
                            isActivePath('/practice') ? 'bg-accent text-accent-foreground' : ''
                          }`}
                        >
                          Practice
                        </Link>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <Link
                          to="/about"
                          className={`block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${
                            isActivePath('/about') ? 'bg-accent text-accent-foreground' : ''
                          }`}
                        >
                          About
                        </Link>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
