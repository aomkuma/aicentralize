import axios, { AxiosInstance, AxiosError } from 'axios'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'

interface ApiError {
  message: string
  status?: number
  data?: unknown
}

export const useApi = () => {
  const apiRef = useRef<AxiosInstance | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  
  // Watch accessToken changes
  const accessToken = useAuthStore((state) => state.accessToken)

  // Reinitialize API instance when token changes
  useEffect(() => {
    apiRef.current = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
      withCredentials: false,
    })

    // Add request interceptor for token - use localStorage which is definitely set by setAuth
    apiRef.current.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken')
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Add response interceptor for error handling
    apiRef.current.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/auth/login'
        }
        return Promise.reject(error)
      }
    )
  }, [accessToken])

  const request = useCallback(
    async <T,>(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      data?: unknown
    ): Promise<T | null> => {
      if (!apiRef.current) {
        setError({ message: 'API client not initialized' })
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        const config =
          method === 'GET' || method === 'DELETE'
            ? { method, url }
            : { method, url, data }

        const response = await apiRef.current.request<T>(config)
        return response.data
      } catch (err) {
        const apiError: ApiError = {
          message: 'An error occurred',
          status: (err as AxiosError)?.response?.status,
          data: (err as AxiosError)?.response?.data,
        }

        if (axios.isAxiosError(err) && err.response?.data) {
          apiError.message =
            (err.response.data as { message?: string }).message ||
            err.message
        } else if (err instanceof Error) {
          apiError.message = err.message
        }

        setError(apiError)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const get = useCallback(
    async <T,>(url: string) => request<T>('GET', url),
    [request]
  )

  const post = useCallback(
    async <T,>(url: string, data?: unknown) =>
      request<T>('POST', url, data),
    [request]
  )

  const patch = useCallback(
    async <T,>(url: string, data?: unknown) =>
      request<T>('PATCH', url, data),
    [request]
  )

  const del = useCallback(
    async <T,>(url: string) => request<T>('DELETE', url),
    [request]
  )

  return { get, post, patch, delete: del, isLoading, error }
}
