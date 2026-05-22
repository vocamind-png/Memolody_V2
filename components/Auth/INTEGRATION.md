# Auth & Subscription System — Integration Guide

> **สถานะ: ⏸ Scaffold พร้อม — รอเชื่อมเมื่อระบบเสถียร**

---

## โครงสร้างไฟล์ที่สร้างไว้

```
lib/
  AuthContext.tsx          ← Auth provider + Tier/Pricing/Feature definitions
  MemoRenderStorage.ts     ← Per-user render history + quota tracking

components/
  Auth/
    LoginGate.tsx          ← Login/Register wall (wrap App ด้วยนี้)
    QuotaModal.tsx         ← Popup เมื่อ quota เต็ม
    QuotaIndicator.tsx     ← แถบ quota เล็กๆ ใน PlayerPage toolbar
  Subscription/
    PricingPage.tsx        ← หน้าเลือก Plan รายเดือน/รายปี
```

---

## วิธีเชื่อมเมื่อพร้อม

### Step 1 — เพิ่ม `AuthProvider` + `LoginGate` ใน `index.tsx`

```tsx
// index.tsx
import { AuthProvider } from './lib/AuthContext';
import { LoginGate } from './components/Auth/LoginGate';

root.render(
  <AuthProvider>
    <LoginGate>
      <App />
    </LoginGate>
  </AuthProvider>
);
```

### Step 2 — เพิ่ม `QuotaIndicator` ใน `PlayerPage.tsx`

```tsx
import { useAuthContext } from '../../lib/AuthContext';
import { QuotaIndicator } from '../Auth/QuotaIndicator';

const { user } = useAuthContext();

// ใน toolbar:
<QuotaIndicator
  userId={user?.id}
  songId={song?.id}
  rendersPerSong={user?.rendersPerSong ?? 3}
  dailySongQuota={user?.dailySongQuota ?? 3}
  tier={user?.tier ?? 'free'}
  onUpgradeClick={() => navigateTo('subscription')}
  refreshKey={renderRefreshKey}  // increment after each render
/>
```

### Step 3 — เช็ค quota ก่อน Render ใน `triggerVocalSynthesis`

```ts
import { checkRenderQuota, recordDailyRender, migrateGlobalHistory } from '../../lib/MemoRenderStorage';
import { useAuthContext } from '../../lib/AuthContext';

const { user } = useAuthContext();

// ตอน load song:
if (user && song.id) migrateGlobalHistory(user.id, song.id);

// ก่อน render:
const quota = checkRenderQuota(user.id, song.id, user.rendersPerSong, user.dailySongQuota);
if (!quota.allowed) {
  setQuotaStatus(quota);
  setShowQuotaModal(true);
  return;
}

// หลัง render สำเร็จ:
recordDailyRender(user.id, song.id);
```

### Step 4 — เพิ่มหน้า Pricing ใน `App.tsx`

```tsx
// ใน renderPage():
case 'subscription':
  return (
    <PricingPage
      currentTier={user?.tier}
      onSelectPlan={(tier, cycle) => {
        // TODO: redirect ไปหน้า payment
        console.log('Upgrade to:', tier, cycle);
      }}
    />
  );
```

### Step 5 — เช็ค feature access ด้วย `canDo()`

```tsx
import { canDo } from '../../lib/AuthContext';

// ปุ่ม Export Stems (Premium only)
{canDo(user?.tier, 'exportStems') ? (
  <button onClick={handleExportStems}>Export WAV/MP3</button>
) : (
  <button onClick={() => navigateTo('subscription')} className="opacity-50">
    🔒 Export (Premium)
  </button>
)}
```

---

## Phase 2 — เปลี่ยน Auth Provider

เมื่อเลือก Provider แล้ว (Supabase / Firebase / อื่น) ให้แก้เฉพาะ
**section `LOCAL STUB ADAPTER`** ใน `lib/AuthContext.tsx` บรรทัด ~60-130

```ts
// แทนที่ stubAdapter ด้วย:
const realAdapter = {
  getSession: async () => { /* Supabase/Firebase getSession */ },
  signIn:     async (email, pass) => { /* ... */ },
  signUp:     async (email, pass, name) => { /* ... */ },
  signOut:    async () => { /* ... */ },
};
```

Interface ด้านบนทุกอย่างไม่ต้องเปลี่ยน ✅

---

## ราคา (TBD — ต้องคำนวณต้นทุน GPU ก่อน)

| Tier | รายเดือน | รายปี | Render/เพลง | เพลง/วัน |
|---|---|---|---|---|
| Free | ฟรี | ฟรี | 3 | 3 |
| Starter | ~149 ฿ | ~1,290 ฿ | 10 | 20 |
| Pro | ~349 ฿ | ~2,990 ฿ | 30 | 50 |
| **Premium** | ~699 ฿ | ~5,990 ฿ | ∞ | ∞ |

> ⚠️ ราคาเป็นตัวอย่างเท่านั้น — แก้ใน `TIER_PRICING` ใน `AuthContext.tsx`

---

## Feature Matrix

| Feature | Free | Starter | Pro | Premium |
|---|:---:|:---:|:---:|:---:|
| Render Vocal | ✅ | ✅ | ✅ | ✅ |
| MemoRender History | ✅ | ✅ | ✅ | ✅ |
| ฟัง Stems | ❌ | ✅ | ✅ | ✅ |
| **📦 Export Stems WAV/MP3** | ❌ | ❌ | ❌ | ✅ |
| Voice Models ทั้งหมด | ❌ | ❌ | ✅ | ✅ |
| Priority GPU | ❌ | ❌ | ❌ | ✅ |
| Early Access | ❌ | ❌ | ❌ | ✅ |
