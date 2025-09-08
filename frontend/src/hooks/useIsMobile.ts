import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint: number = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkIsMobile = () => {
      // Check if it's a touch device or small screen
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth < breakpoint || window.innerHeight < 500
      
      // Also check for mobile user agent as fallback
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      const isMobileUserAgent = mobileRegex.test(navigator.userAgent)
      
      setIsMobile((isTouchDevice && isSmallScreen) || isMobileUserAgent)
    }

    // Check on mount
    checkIsMobile()

    // Listen for resize and orientation change events
    window.addEventListener('resize', checkIsMobile)
    window.addEventListener('orientationchange', checkIsMobile)

    return () => {
      window.removeEventListener('resize', checkIsMobile)
      window.removeEventListener('orientationchange', checkIsMobile)
    }
  }, [breakpoint])

  return isMobile
}