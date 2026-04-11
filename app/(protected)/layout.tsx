'use client'

import ProtectedShell from './ProtectedShell'
import Script from 'next/script'

export default function ProtectedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            {/* lamejs loaded globally to avoid Turbopack CJS interop issues.
                Mp3Encoder uses internal vars (MPEGMode) that Turbopack tree-shakes
                when imported as ESM. Script tag runs in original scope, preserving closures. */}
            <Script src="/lame.min.js" strategy="afterInteractive" />
            <ProtectedShell>{children}</ProtectedShell>
        </>
    )
}
