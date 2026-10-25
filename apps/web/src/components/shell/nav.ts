import {
  BarChart3, Bell, Bookmark, Briefcase, Building2, Handshake, LayoutDashboard, Mail, Plug, Rss, Shield, Users, Network,
} from 'lucide-react';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/requirements', label: 'All Requirements', icon: Briefcase },
  { href: '/sources', label: 'Job Board Sources', icon: Rss },
  { href: '/email', label: 'Email Requirements', icon: Mail },
  { href: '/vendors?category=prime_vendor', label: 'Prime Vendors', icon: Building2, match: 'category=prime_vendor' },
  { href: '/vendors?category=implementation_partner', label: 'Implementation Partners', icon: Handshake, match: 'category=implementation_partner' },
  { href: '/vendors', label: 'Vendor Directory', icon: Network },
  { href: '/consultants', label: 'Consultant Bench', icon: Users },
  { href: '/saved-searches', label: 'Saved Searches', icon: Bookmark },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings/integrations', label: 'Integration Settings', icon: Plug },
  { href: '/settings/security', label: 'User and Security Settings', icon: Shield },
] as const;
