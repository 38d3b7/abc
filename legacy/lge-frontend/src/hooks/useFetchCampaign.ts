import { useState, useEffect } from 'react'
import { getCampaignByHook } from '../services/api/campaign'
import { Campaign } from '../types'

export function useFetchCampaign (campaignAddress?: string) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchCampaign = async () => {
      if (!campaignAddress) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const response = await getCampaignByHook(campaignAddress)
        setCampaign(response.data)
      } catch (err) {
        console.error('Error fetching campaign:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    fetchCampaign()
  }, [campaignAddress])

  return { campaign, loading, error }
}
