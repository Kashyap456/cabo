import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint: number = 1024) {
  const [isMobile, setIsMobile] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)

  useEffect(() => {
    const checkDevice = () => {
      // Check if it's a touch device or small screen
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth < breakpoint || window.innerHeight < 500
      
      // Also check for mobile user agent as fallback
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      const isMobileUserAgent = mobileRegex.test(navigator.userAgent)
      
      setIsMobile((isTouchDevice && isSmallScreen) || isMobileUserAgent)
      setIsLandscape(window.innerWidth > window.innerHeight)
    }

    // Check on mount
    checkDevice()

    // Listen for resize and orientation change events
    window.addEventListener('resize', checkDevice)
    window.addEventListener('orientationchange', checkDevice)

    return () => {
      window.removeEventListener('resize', checkDevice)
      window.removeEventListener('orientationchange', checkDevice)
    }
  }, [breakpoint])

  return { isMobile, isLandscape }
}