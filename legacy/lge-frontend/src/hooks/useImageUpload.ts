import { useState } from 'react'
import toast from 'react-hot-toast'
import { uploadImage } from '../services/api/campaign'
import { UseImageUploadParams } from '../types'

export function useImageUpload ({ walletAddress, onSuccess }: UseImageUploadParams) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleImageUpload = async (file: File) => {
    if (!walletAddress) {
      toast.error('Wallet address required')
      return
    }

    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('walletAddress', walletAddress)

    try {
      const response = await uploadImage(formData)
      const imageUrl = response.data
      toast.success('Image uploaded successfully!')
      if (onSuccess) {
        onSuccess(imageUrl)
      }
      return imageUrl
    } catch (error) {
      console.error('Image upload error:', error)
      toast.error('Failed to upload image')
      throw error
    } finally {
      setIsUploading(false)
    }
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleImageUpload(e.target.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('image/')) {
        await handleImageUpload(file)
      } else {
        toast.error('Please upload an image file')
      }
    }
  }

  return {
    isUploading,
    isDragging,
    handleImageChange,
    handleDragOver,
    handleDragLeave,
    handleDrop
  }
}
