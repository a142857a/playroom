import {t} from './i18n.js';
import { LEVELS, getStageCheckpoint } from './campaign.js';
const $=id=>document.getElementById(id);
export class Hangar {
 constructor(profile,callbacks){
  this.profile=profile;this.callbacks=callbacks;this.selectedStage=profile.lastStage||1;
  $('stageLaunchBtn').addEventListener('click',()=>callbacks.launch(this.selectedStage));
  this.render();
 }
 focus(){
  this.callbacks.pause();
  $('hangarPanel').scrollIntoView({block:'nearest',behavior:'auto'});
  $('stageGrid').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
 }
 select(id){
  if(!Number.isInteger(id)||id<1||id>LEVELS.length)return;
  this.callbacks.pause();this.selectedStage=id;this.render();this.callbacks.select?.(id);
  $('stageGrid').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
 }
 render(){
  $('campaignProgress').textContent=t('{cleared} of {total} cleared',{cleared:this.profile.cleared.length,total:LEVELS.length});
  const fragment=document.createDocumentFragment();
  for(const stage of LEVELS){
   const btn=document.createElement('button');btn.type='button';btn.className='stage-card'+(stage.id===this.selectedStage?' is-selected':'');
   btn.setAttribute('aria-pressed',String(stage.id===this.selectedStage));
   btn.innerHTML=`<span class="stage-index">${String(stage.id).padStart(2,'0')}</span><span class="stage-title">${t(stage.name)}</span><span class="stage-status">${this.profile.cleared.includes(stage.id)?t('Cleared'):''}</span>`;
   btn.addEventListener('click',()=>this.select(stage.id));fragment.append(btn);
  }
  $('stageGrid').replaceChildren(fragment);
  const stage=LEVELS[this.selectedStage-1];
  $('bossPreview').textContent=t('Boss: {boss}',{boss:t(stage.bossName)});
  $('stageRank').textContent=t('Starting rank {rank}',{rank:getStageCheckpoint(this.profile,this.selectedStage).rank})+(stage.theme?' · '+t(stage.theme):'');
  $('stageLaunchBtn').textContent=t('Play sector {sector}',{sector:String(stage.id).padStart(2,'0')});
 }
}
