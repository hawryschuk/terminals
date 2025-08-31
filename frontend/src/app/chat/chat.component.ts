import { Component, computed, input, model, output, Output } from '@angular/core';
import { Messaging } from '../../../../Messaging';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceCenterClient } from '../../../../ServiceCenterClient';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent {

  send = output<string>();

  messages = input.required<ServiceCenterClient['Messages']['Everyone']>();

  users = input.required<ServiceCenterClient['Users']['Online']>();

  type = input.required<'table' | 'service' | 'all' | 'direct'>();

  selectedUser = model<string>();
}
