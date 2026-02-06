-- =============================================================================
-- AGENCY SETTINGS MODULE
-- =============================================================================
--
-- Created at: 2026-01-22
-- Purpose: Add agency profiles, services catalog, and source tracking for deals
--
-- Includes:
-- 1. agency_profiles table (single agency profile per org)
-- 2. agency_services table (services catalog with pricing)
-- 3. source column in deals table (lead origin tracking)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AGENCY_PROFILES (Perfil da agência)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Basic Information
    name TEXT NOT NULL DEFAULT 'Ads Rocket',
    description TEXT,

    -- Contact Information
    phone TEXT,
    email TEXT,
    instagram TEXT,
    website TEXT,

    -- Branding
    logo_url TEXT,
    primary_color TEXT DEFAULT '#6366F1',

    -- Goals & Metrics
    monthly_goal DECIMAL(15, 2) DEFAULT 0,
    client_goal INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one profile per organization
    UNIQUE(organization_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agency_profiles_org
ON public.agency_profiles(organization_id);

-- Enable RLS
ALTER TABLE public.agency_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read their organization's profile
CREATE POLICY "Users can view their organization's agency profile"
ON public.agency_profiles
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id = agency_profiles.organization_id
    )
);

-- Allow authenticated users to insert/update their organization's profile
CREATE POLICY "Users can manage their organization's agency profile"
ON public.agency_profiles
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id = agency_profiles.organization_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id = agency_profiles.organization_id
    )
);

-- -----------------------------------------------------------------------------
-- 2. AGENCY_SERVICES (Catálogo de serviços)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Service Information
    name TEXT NOT NULL,
    description TEXT,

    -- Pricing
    price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    commission DECIMAL(5, 2) DEFAULT 0, -- Percentage (0-100)

    -- Status
    active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agency_services_org
ON public.agency_services(organization_id);

CREATE INDEX IF NOT EXISTS idx_agency_services_active
ON public.agency_services(organization_id, active);

-- Enable RLS
ALTER TABLE public.agency_services ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read their organization's services
CREATE POLICY "Users can view their organization's services"
ON public.agency_services
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id = agency_services.organization_id
    )
);

-- Allow authenticated users to manage their organization's services
CREATE POLICY "Users can manage their organization's services"
ON public.agency_services
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id = agency_services.organization_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.organization_id = agency_services.organization_id
    )
);

-- -----------------------------------------------------------------------------
-- 3. ADD SOURCE COLUMN TO DEALS (Lead origin tracking)
-- -----------------------------------------------------------------------------
ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS source TEXT;

-- Add service_id to link deals with services
ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.agency_services(id) ON DELETE SET NULL;

-- Create index for faster filtering by source
CREATE INDEX IF NOT EXISTS idx_deals_source
ON public.deals(source) WHERE source IS NOT NULL;

-- Create index for service lookups
CREATE INDEX IF NOT EXISTS idx_deals_service
ON public.deals(service_id) WHERE service_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGERS
-- -----------------------------------------------------------------------------

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to agency_profiles
DROP TRIGGER IF EXISTS update_agency_profiles_updated_at ON public.agency_profiles;
CREATE TRIGGER update_agency_profiles_updated_at
    BEFORE UPDATE ON public.agency_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to agency_services
DROP TRIGGER IF EXISTS update_agency_services_updated_at ON public.agency_services;
CREATE TRIGGER update_agency_services_updated_at
    BEFORE UPDATE ON public.agency_services
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5. DEFAULT DATA (Optional - can be seeded later)
-- -----------------------------------------------------------------------------

-- Insert default agency profile for existing organizations
-- (Only if they don't have one yet)
INSERT INTO public.agency_profiles (organization_id, name, monthly_goal, client_goal)
SELECT
    id,
    'Ads Rocket',
    50000.00,
    10
FROM public.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM public.agency_profiles
    WHERE agency_profiles.organization_id = organizations.id
)
ON CONFLICT (organization_id) DO NOTHING;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
