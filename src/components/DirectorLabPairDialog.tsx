import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import type { DirectorLabDiscoveredService } from '../shared/types'
import { Button, Dialog, Input, Select, toast } from '../ui'
import './DirectorLabPairDialog.css'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaired: (endpoint: string) => Promise<boolean>
}

export function DirectorLabPairDialog({ open, onOpenChange, onPaired }: Props) {
  const [services, setServices] = useState<DirectorLabDiscoveredService[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [error, setError] = useState('')

  const discover = useCallback(async (): Promise<void> => {
    setScanning(true)
    setError('')
    try {
      const result = await window.luna.directorLab.discover()
      setServices(result.services)
      setSelectedServiceId((current) => result.services.some((service) => service.id === current)
        ? current : result.services[0]?.id ?? '')
    } catch {
      setServices([])
      setSelectedServiceId('')
      setError('搜索手机失败')
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setPairingCode('')
    setError('')
    void discover()
  }, [discover, open])

  const selectedService = services.find((service) => service.id === selectedServiceId)
  const options = services.map((service) => ({
    value: service.id,
    label: `${service.name} · ${service.host}`,
  }))

  async function pair(): Promise<void> {
    if (!selectedService || pairingCode.length !== 8 || pairing) return
    setPairing(true)
    setError('')
    try {
      await window.luna.lunaKaHttpClient.pair(selectedService.baseUrl, pairingCode)
      const connected = await onPaired(selectedService.baseUrl)
      if (!connected) throw new Error('配对成功，但手机暂时无法连接')
      toast.success('配对成功')
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '配对失败')
    } finally {
      setPairing(false)
    }
  }

  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="配对手机"
    className="director-lab-pair-dialog"
    bodyClassName="director-lab-pair-dialog-body"
    closeOnMaskClick={!pairing}
    showCloseButton={!pairing}
    footer={<>
      <Button variant="secondary" disabled={pairing} onClick={() => onOpenChange(false)}>取消</Button>
      <Button variant="primary" disabled={pairing || !selectedService || pairingCode.length !== 8}
        onClick={() => void pair()}>{pairing ? '配对中' : '配对'}</Button>
    </>}
  >
    <div className="director-lab-pair-fields">
      <div className="director-lab-pair-device">
        <Select
          fullWidth
          value={selectedServiceId}
          options={options}
          placeholder="选择手机"
          disabled={scanning || services.length === 0 || pairing}
          onValueChange={setSelectedServiceId}
        />
        <Button variant="utility" size="default" disabled={scanning || pairing}
          aria-label="重新搜索手机" onClick={() => void discover()}>
          <RefreshCw size={15} className={scanning ? 'is-spinning' : undefined} />
        </Button>
      </div>
      <Input
        fullWidth
        aria-label="配对码"
        placeholder="输入 8 位配对码"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={8}
        disabled={pairing}
        value={pairingCode}
        onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
      />
      {error && <p className="director-lab-pair-error" role="alert">{error}</p>}
    </div>
  </Dialog>
}
