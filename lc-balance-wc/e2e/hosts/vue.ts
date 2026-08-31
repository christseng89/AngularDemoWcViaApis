import { createApp, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { createBalanceComponentVueBinding } from '../../src/adapters/vue/balance-component-vue';
import { BalanceComponentElement } from '../../src/app/web-component/balance-component-element.contract';
import { exposeHost } from './host-api';

createApp({
  setup() {
    const element = ref<BalanceComponentElement | null>(null);
    const binding = createBalanceComponentVueBinding();
    let cleanup = () => undefined;
    onMounted(() => {
      binding.mount(element.value!, { version: '1', theme: 'light' });
      cleanup = exposeHost(element.value!, binding);
    });
    onBeforeUnmount(() => {
      cleanup();
      binding.unmount();
    });
    return () => h('balance-component-app', { ref: element });
  },
}).mount('#host');
