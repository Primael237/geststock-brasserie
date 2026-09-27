import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, Store, ShoppingCart,
  ClipboardList, Lock, LogOut, ChevronLeft, ChevronRight,
  PlusCircle, History, CreditCard, BarChart3,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import appIcon from '../assets/app-icon.png';

const navItems = [
  { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { path: '/users', label: 'Utilisateurs', icon: Users, role: 'super_admin' },
  { path: '/products', label: 'Produits', icon: Package },
  { path: '/clients', label: 'Clients', icon: Store },
  {
    path: '/sales', label: 'Ventes', icon: ShoppingCart,
    children: [
      { path: '/sales', label: 'Nouvelle vente', icon: PlusCircle, end: true },
      { path: '/sales/history', label: 'Historique des ventes', icon: History },
      { path: '/sales/credits', label: 'Ventes à crédit', icon: CreditCard },
    ],
  },
  { path: '/inventory', label: 'Inventaire', icon: ClipboardList },
  { path: '/cash', label: 'Caisse', icon: Lock },
  { path: '/reports', label: 'Rapports', icon: BarChart3 },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredNav = navItems.filter(
    (item) => !item.role || item.role === user?.role || user?.role === 'super_admin'
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-16'
        } bg-primary-950 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-primary-800">
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={appIcon} alt="" className="w-9 h-9 rounded-lg shrink-0 object-cover ring-2 ring-brand-gold/70" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight truncate">GestStock</h1>
                <p className="text-xs text-primary-300">Brasserie v1.0</p>
              </div>
            </div>
          ) : (
            <img src={appIcon} alt="" className="w-8 h-8 rounded-lg object-cover ring-2 ring-brand-gold/70" />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-primary-800 text-primary-300"
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isParentActive = location.pathname.startsWith(item.path);
            return (
              <div key={item.path}>
                <NavLink
                  to={item.path}
                  end={!item.children}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm border-l-2 ${
                      (item.children ? isParentActive : isActive)
                        ? 'bg-primary-700 text-white font-medium border-brand-gold [&>svg]:text-brand-gold-light'
                        : 'text-primary-200 hover:bg-primary-800 hover:text-white border-transparent'
                    }`
                  }
                >
                  <Icon size={18} strokeWidth={2} className="shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </NavLink>
                {item.children && sidebarOpen && isParentActive && (
                  <div className="mt-1 ml-4 pl-3 border-l border-primary-800 space-y-0.5">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          end={child.end}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors text-xs ${
                              isActive
                                ? 'bg-primary-800 text-white font-medium'
                                : 'text-primary-300 hover:bg-primary-800 hover:text-white'
                            }`
                          }
                        >
                          <ChildIcon size={14} className="shrink-0" />
                          <span>{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="p-3 border-t border-primary-800">
          {sidebarOpen && (
            <div className="mb-2">
              <p className="text-sm font-medium truncate">{user?.full_name || user?.username}</p>
              <p className="text-xs text-primary-400 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-300 hover:bg-primary-800 hover:text-white rounded-lg transition-colors"
          >
            <LogOut size={16} className="shrink-0" />
            {sidebarOpen && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}