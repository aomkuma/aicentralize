import { useEffect, useState } from 'react'

export type BreakpointType = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

interface Breakpoints {
  xs: boolean
  sm: boolean
  md: boolean
  lg: boolean
  xl: boolean
  '2xl': boolean
}

/**
 * Hook to detect current breakpoint
 * Tailwind breakpoints:
 * xs: 0px
 * sm: 640px
 * md: 768px
 * lg: 1024px
 * xl: 1280px
 * 2xl: 1536px
 */
export function useBreakpoint(): Breakpoints {
  const [breakpoint, setBreakpoint] = useState<Breakpoints>({
    xs: false,
    sm: false,
    md: false,
    lg: false,
    xl: false,
    '2xl': false,
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setBreakpoint({
        xs: width < 640,
        sm: width >= 640 && width < 768,
        md: width >= 768 && width < 1024,
        lg: width >= 1024 && width < 1280,
        xl: width >= 1280 && width < 1536,
        '2xl': width >= 1536,
      })
    }

    // Initial call
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return breakpoint
}

/**
 * Hook to check if current width is greater than or equal to a breakpoint
 */
export function useMinWidth(breakpoint: BreakpointType): boolean {
  const breakpoints = useBreakpoint()
  return breakpoints[breakpoint] || Object.keys(breakpoints).indexOf(breakpoint) <= Object.keys(breakpoints).indexOf('xs')
}

/**
 * Hook to check if current width is less than a breakpoint
 */
export function useMaxWidth(breakpoint: BreakpointType): boolean {
  const breakpoints = useBreakpoint()
  return breakpoints[breakpoint]
}

/**
 * Hook to check if device is mobile
 */
export function useMobileLayout(): boolean {
  const bp = useBreakpoint()
  return bp.xs || bp.sm
}

/**
 * Hook to check if device is tablet
 */
export function useTabletLayout(): boolean {
  const bp = useBreakpoint()
  return bp.md || bp.lg
}

/**
 * Hook to check if device is desktop
 */
export function useDesktopLayout(): boolean {
  const bp = useBreakpoint()
  return bp.xl || bp['2xl']
}
