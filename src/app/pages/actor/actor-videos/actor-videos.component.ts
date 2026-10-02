import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../actor-nav/actor-nav.component';
import { TalentVideoUploaderComponent } from '../talent-video-uploader/talent-video-uploader.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorVideo, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { actorVideoStatusClass, isAwaitingUpload } from '../../../shared/utils/marketplace-status';
import { apiErrorMessage } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-actor-videos',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, ActorNavComponent, PaymentModalComponent, VideoPlayerComponent,
    TalentVideoUploaderComponent,
  ],
  templateUrl: './actor-videos.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorVideosComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);

  videos   = signal<ActorVideo[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  purchase = signal<ServicePurchase | null>(null);
  /** Signed URL of the video being previewed — cleared on close, never persisted. */
  previewSrc = signal<string | null>(null);

  readonly statusClass = actorVideoStatusClass;
  readonly canUpload = isAwaitingUpload;

  form = this.fb.nonNullable.group({
    title:       ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.marketplace.getMyVideos().subscribe({
      next: (list) => { this.videos.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  /** Step 1: pay the upload fee. The actor_video record is created with the payment. */
  startPurchase(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { title, description } = this.form.getRawValue();
    this.purchase.set({
      titleKey: 'marketplace.videos.purchaseTitle',
      descriptionKey: 'marketplace.videos.purchaseDesc',
      initiate: (phone) => this.marketplace.purchaseVideo({
        title: title.trim(),
        description: description.trim() || undefined,
        phone_number: phone,
      }),
    });
  }

  /** Step 2 (after polling completes): the paid video appears as pending_upload. */
  onPaid(): void {
    this.purchase.set(null);
    this.form.reset();
    this.load();
  }

  closePurchase(): void {
    this.purchase.set(null);
    this.load(); // a payment may have been started before the modal closed
  }

  preview(v: ActorVideo): void {
    if (v.video_url) this.previewSrc.set(v.video_url);
  }

  closePreview(): void {
    this.previewSrc.set(null);
  }
}
