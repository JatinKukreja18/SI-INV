import { requireSession } from '@/lib/server-auth'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const session = await requireSession()
  return <SettingsClient currentName={session.user.name ?? ''} />
}
