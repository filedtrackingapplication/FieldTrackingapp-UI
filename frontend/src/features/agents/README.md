# Agents Feature Module

This folder contains all agent-related functionality for the Field Tracking application.

## Folder Structure

```
src/features/agents/
├── Agents.tsx              # Main container component
├── index.ts                # Public API exports
├── components/
│   ├── AddAgentModal.tsx   # Form modal for adding new agents
│   └── index.ts            # Component exports
├── pages/
│   └── README.md           # Reserved for sub-pages (AgentDetail, AgentProfile, etc.)
├── types/
│   └── index.ts            # TypeScript types, interfaces, and constants
└── utils/
    └── validation.ts       # Form validation functions
```

## Key Files

### **Agents.tsx** (Container)
Main agent management page with:
- Agent list table
- Search functionality
- CSV import
- Add Agent button (opens modal)
- Online/Offline status
- Role badges

### **AddAgentModal.tsx** (Component)
Modal form for creating new agents with:
- Employee ID
- Full Name
- Email
- Phone
- Password
- Role (dropdown: Admin, Manager, Field Agent, Driver)
- Vehicle Number
- Assigned Zone
- Real-time field validation
- Success/Error notifications

### **validation.ts** (Utils)
Validation functions:
- `validateAgentForm()` - Validate entire form
- `validateField()` - Validate single field on blur
- Field-specific rules (email, phone, password, etc.)

### **types/index.ts**
- `AddAgentFormData` - Form input interface
- `AgentFormErrors` - Form errors interface
- `UserRole` - Role type definition
- `ROLE_OPTIONS` - Dropdown options

## Usage

### Import from feature
```typescript
// Import main container
import { Agents } from '@/features/agents'

// Import specific components
import { AddAgentModal } from '@/features/agents/components'

// Import types
import type { AddAgentFormData, UserRole } from '@/features/agents/types'

// Import validation
import { validateAgentForm, validateField } from '@/features/agents/utils/validation'
```

### Using in App Router
```typescript
const Agents = lazy(() => import('./features/agents/Agents'))
// Inside routes:
<Route path="agents" element={<Agents />} />
```

## Future Sub-pages (pages/ folder)

This structure allows for easy expansion with sub-pages:
- `AgentDetail.tsx` - View/edit individual agent
- `AgentProfile.tsx` - Agent profile and settings
- `AgentActivity.tsx` - Activity log
- `AgentAnalytics.tsx` - Performance metrics

## API Integration

The module uses:
- `authApi.register()` - Create new agent
- `agentsApi.list()` - Fetch agents list
- `agentsApi` endpoints - Agent management

## Features

✅ Create agents via modal form
✅ Real-time field validation
✅ Success/error notifications
✅ CSV bulk import
✅ Search agents
✅ View agent status (online/offline)
✅ Role-based display
✅ Clean, organized file structure

## Best Practices

1. **Keep container logic** in `Agents.tsx`
2. **Reusable components** in `components/` folder
3. **Shared types** in `types/` folder
4. **Validation logic** in `utils/` folder
5. **Sub-pages** in `pages/` folder
