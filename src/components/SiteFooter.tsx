
import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Mic } from 'lucide-react';

export const SiteFooter: React.FC = () => {
  return (
    <footer className="border-t bg-white text-muted-foreground">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Mic className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">SpeechSmith</h3>
            </div>
            <p className="text-sm">
              AI-powered speech analysis platform helping you improve your communication skills.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-3">Quick Links</h4>
            <ul className="text-sm space-y-2">
              <li>
                <Link to="/about" className="hover:text-foreground transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/practice" className="hover:text-foreground transition-colors">
                  Practice Sessions
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-3">Contact Us</h4>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a href="mailto:speechsmith.ai@gmail.com" className="hover:text-foreground transition-colors">
                  speechsmith.ai@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} SpeechSmith. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
