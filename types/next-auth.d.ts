import type { DefaultSession } from 'next-auth'
import type { DataScope } from '@/types'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: 'admin' | 'staff'
      dataScope: DataScope
    }
  }

  interface User {
    id: string
    role: 'admin' | 'staff'
    dataScope: DataScope
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'admin' | 'staff'
    dataScope: DataScope
  }
}
