import { AnimationSystemGroup, defineQuery, defineSystem, ECSState, getComponent, getMutableComponent, getOptionalComponent, setComponent, SimulationSystemGroup, useComponent, useOptionalComponent } from "@etherealengine/ecs"
import { AvatarComponent } from "@etherealengine/engine/src/avatar/components/AvatarComponent"
import { getState } from "@etherealengine/hyperflux"
import { MotionCaptureRigComponent } from '@etherealengine/engine/src/mocap/MotionCaptureRigComponent'
import { AnimationClip, AnimationMixer, InterpolateDiscrete, InterpolateLinear, InterpolateSmooth, KeyframeTrack, Mesh, Object3D, QuaternionKeyframeTrack, SphereGeometry } from "three"
import { VRMHumanBoneList } from '@pixiv/three-vrm'
import { AvatarRigComponent } from "@etherealengine/engine/src/avatar/components/AvatarAnimationComponent"
import { AnimationComponent } from "@etherealengine/engine/src/avatar/components/AnimationComponent"
import { GLTFExporter } from "@etherealengine/engine/src/assets/exporters/gltf/GLTFExporter"
import { uploadProjectFiles } from "@etherealengine/editor/src/functions/assetFunctions"
import { useGLTF } from "@etherealengine/engine/src/assets/functions/resourceLoaderHooks"
import {useEffect} from 'react'

let elapsedAnimationTime = 0

const mocapClip = new AnimationClip('Mocap Animation', 0, [])

export default defineSystem({
  uuid: 'MocapBakingSystem',
  insert: { after: AnimationSystemGroup },
  execute: () => {
    const avatarEntity = AvatarComponent.getSelfAvatarEntity()
    const mocapRig = getOptionalComponent(avatarEntity, MotionCaptureRigComponent)

    //if the mocap session has ended, set the clip to trigger the reactor's useeffect
    if(!mocapRig && mocapClip.tracks.length > 0 && getComponent(avatarEntity, AnimationComponent).animations[0].name !== 'Mocap Animation'){
      mocapClip.duration = elapsedAnimationTime
      getMutableComponent(avatarEntity, AnimationComponent).animations[0].set(mocapClip)
      return
    }

    if(!mocapRig) return

    const rig = getComponent(avatarEntity, AvatarRigComponent).vrm.humanoid.rawHumanBones
    for(let i = 0; i < VRMHumanBoneList.length; i++){
      const vrmBoneName = VRMHumanBoneList[i]
      const bone = rig[vrmBoneName]?.node
      if(!bone) continue
      if(!mocapClip.tracks[i]){
        mocapClip.tracks[i] = new QuaternionKeyframeTrack(bone.name + '.quaternion', [0], [0], InterpolateLinear)
      } 
        
      const track = mocapClip.tracks[i]

      //create the flat quaternion
      const flatQuat = new Float32Array(4)
      flatQuat[0] = bone.quaternion.x
      flatQuat[1] = bone.quaternion.y
      flatQuat[2] = bone.quaternion.z
      flatQuat[3] = bone.quaternion.w

      //add the flatQuat to the values array
      const values = new Float32Array(track.values.length + 4)
      if( track.values.length > 1 ){
        values.set(track.values)
        values.set(flatQuat, track.values.length)
        track.values = values
      } else track.values = flatQuat

      //add the new elapsed time to the times array
      const times = new Float32Array(track.times.length + 1)
      if(track.times.length > 0 && track.times[track.times.length - 1] < elapsedAnimationTime){
        times.set(track.times)
        times.set([elapsedAnimationTime], track.times.length)
        track.times = times
      } else track.times = new Float32Array([elapsedAnimationTime])
      //assign values, time, name to the track
      mocapClip.tracks[i] = new QuaternionKeyframeTrack(bone.name + '.quaternion', track.times, track.values, InterpolateLinear)
    }
    elapsedAnimationTime += getState(ECSState).deltaSeconds
  },

  reactor: () => {
    //this shouldnt be hard coded, but for now it is (im lazy)
    const [puppet] = useGLTF('https://172.27.136.37:8642/projects/eepro-avatar-pack-base/assets/avatars/Zlorp.gltf')
    const entity = AvatarComponent.useSelfAvatarEntity()
    const anim = useOptionalComponent(entity, AnimationComponent)?.animations
    useEffect(() => {
      console.log('exporting this thing', puppet, anim)
      if(!anim?.value || anim[0]?.value?.name !== 'Mocap Animation') return
      if(!puppet || typeof puppet !== 'object') return
      const exporter = new GLTFExporter()
      puppet.scene.animations = [getComponent(AvatarComponent.getSelfAvatarEntity(), AnimationComponent).animations[0]]
      console.log(puppet.scene.animations[0].tracks.length)
      const tracks = [] as KeyframeTrack[]
      for(let i = 0; i < puppet.scene.animations[0].tracks.length; i++){
        if(!!puppet.scene.animations[0].tracks[i]?.clone) tracks.push(puppet.scene.animations[0].tracks[i])
      }
      console.log(tracks)
      puppet.scene.animations = [new AnimationClip('mocap animation', puppet.scene.animations[0].duration, tracks)]
      exporter.parseAsync(puppet.scene, {binary: true, animations: puppet.scene.animations}).then((glb: ArrayBuffer) => {
        const file = new File([glb], 'mocap-animation-test.glb')
        uploadProjectFiles('mocap-animations', [file], [`projects/${'mocap-animations'}`]).promises
        console.log(file)
      })
  
    }, [anim, puppet, entity])

    return null
  }
})