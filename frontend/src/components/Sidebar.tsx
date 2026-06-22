import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MapPin, Users, ClipboardList, ShoppingCart,
  Package, DollarSign, UserCheck, Gauge, Clock, BarChart3, Truck, Box,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'manager', 'field_agent', 'driver'] },
  { to: '/tracking', icon: MapPin, label: 'Live Tracking', roles: ['admin', 'manager'] },
  { to: '/agents', icon: Users, label: 'Agents', roles: ['admin', 'manager'] },
  { to: '/punch', icon: Clock, label: 'Punch In/Out', roles: ['field_agent', 'driver', 'manager'] },
  { to: '/visits', icon: ClipboardList, label: 'Visits', roles: ['admin', 'manager', 'field_agent', 'driver'] },
  { to: '/orders', icon: ShoppingCart, label: 'Orders', roles: ['admin', 'manager', 'field_agent', 'driver'] },
  { to: '/products', icon: Box, label: 'Products', roles: ['admin', 'manager', 'field_agent', 'driver'] },
  { to: '/inventory', icon: Package, label: 'Inventory', roles: ['admin', 'manager', 'driver'] },
  { to: '/expenses', icon: DollarSign, label: 'Expenses', roles: ['admin', 'manager', 'field_agent', 'driver'] },
  { to: '/customers', icon: UserCheck, label: 'Customers', roles: ['admin', 'manager', 'field_agent', 'driver'] },
  { to: '/odometer', icon: Gauge, label: 'Odometer', roles: ['admin', 'manager', 'driver'] },
  { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['admin', 'manager'] },
  { to: '/admin/attendance', icon: Clock, label: 'Attendance', roles: ['admin'] },
]

export default function Sidebar() {
  const { user } = useAuthStore()
  const role = user?.role ?? 'field_agent'

  const visible = navItems.filter((n) => n.roles.includes(role))

  return (
    <aside className="w-60 bg-primary-900 text-white flex flex-col shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-primary-700">
        <Truck className="w-8 h-8 text-blue-300" />
        <div>
          <p className="font-bold text-lg leading-none">TrackForce</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {visible.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-700 text-white border-r-4 border-blue-300'
                  : 'text-blue-200 hover:bg-primary-800 hover:text-white'
              )
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-5 py-4 border-t border-primary-700">
        <p className="text-sm font-medium truncate">{user?.full_name}</p>
        <p className="text-xs text-blue-300 capitalize">{user?.role?.replace('_', ' ')}</p>
      </div>
    </aside>
  )
}
