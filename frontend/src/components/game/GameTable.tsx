import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GameTableProps {
  children: ReactNode
  className?: string
  showPositionGuides?: boolean
}

const GameTable = ({ children, className, showPositionGuides = true }: GameTableProps) => {
  return (
    <div className="fixed inset-0 w-full h-screen overflow-hidden">
      {/* Diamond pattern floor background */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            repeating-linear-gradient(
              45deg,
              #8B0000,
              #8B0000 40px,
              #A52A2A 40px,
              #A52A2A 80px
            ),
            repeating-linear-gradient(
              -45deg,
              #8B0000,
              #8B0000 40px,
              #A52A2A 40px,
              #A52A2A 80px
            )
          `,
          backgroundBlendMode: 'multiply',
        }}
      />
      
      {/* Table container */}
      <div className="relative flex items-center justify-center w-full h-full p-8">
        <div className={cn("relative w-[85vw] h-[75vh] max-w-[1200px] max-h-[700px]", className)}>
          {/* Table shadow */}
          <div 
            className="absolute inset-0 bg-black/30 blur-xl"
            style={{
              borderRadius: '50%',
              transform: 'translateY(10px) scaleY(0.9)',
            }}
          />
          
          {/* Table surface with wood border */}
          <div 
            className="absolute inset-0 rounded-full p-3"
            style={{
              background: 'linear-gradient(180deg, #8B4513 0%, #654321 50%, #8B4513 100%)',
              boxShadow: '0 0 50px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Inner table surface */}
            <div 
              className="relative w-full h-full bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 rounded-full"
              style={{
                boxShadow: `
                  inset 0 0 50px rgba(0, 0, 0, 0.5),
                  inset 0 0 20px rgba(0, 50, 100, 0.3)
                `,
              }}
            >
              {/* Felt texture */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-30 rounded-full"
                style={{
                  background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23000' fill-opacity='0.1' d='M1 1h1v1H1V1zm2 2h1v1H3V3z'/%3E%3C/svg%3E")`,
                }}
              />
              
              {/* Position guides (for debugging) */}
              {showPositionGuides && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Inner ellipse guide where cards are positioned */}
                  <div 
                    className="absolute border-2 border-dashed border-yellow-400/50 rounded-full"
                    style={{
                      left: '10%',
                      top: '10%',
                      width: '80%',
                      height: '80%',
                    }}
                  />
                  {/* Center point */}
                  <div 
                    className="absolute w-2 h-2 bg-red-500 rounded-full"
                    style={{
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                </div>
              )}
              
              {/* Content */}
              <div className="relative w-full h-full">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GameTable